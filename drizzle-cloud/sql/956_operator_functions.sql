-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. What the operator console can see and do -- all of it, since
-- gw_operator has no other grant. Re-applied on every run.
--
-- Reads return figures, never content: names of workspaces and customers,
-- states, counts, invoices. Every change writes operator_audit in the same
-- transaction, with the operator it was made by.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.op_audit(p_operator uuid, p_action text, p_tenant uuid, p_detail jsonb)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into operator_audit (operator_id, action, tenant_id, detail)
  values (p_operator, p_action, p_tenant, coalesce(p_detail, '{}'));
$$;

create or replace function app.op_tenants(p_tenant uuid default null)
returns table (
  id uuid, name text, status text, state text, trial_ends_at timestamptz, delete_after timestamptz,
  created_at timestamptz, company_name text, country text, vat_status text, plan text, next_plan text,
  payment_method_ready boolean, billing_email text, members integer, workshops integer,
  held_periods integer, failed_periods integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select t.id, t.name, t.status, l.state, l.trial_ends_at, l.delete_after, t.created_at,
         b.company_name, b.country, b.vat_status, b.plan, b.next_plan, b.payment_method_ready,
         b.billing_email::text,
         (select count(*)::int from member m where m.tenant_id = t.id and m.status = 'active'),
         (select count(*)::int from workshop w where w.tenant_id = t.id and w.deleted_at is null),
         (select count(*)::int from billing_period p where p.tenant_id = t.id and p.status = 'held'),
         (select count(*)::int from billing_period p where p.tenant_id = t.id and p.status = 'failed')
    from tenant t
    join tenant_lifecycle l on l.tenant_id = t.id
    left join billing_account b on b.tenant_id = t.id
   where p_tenant is null or t.id = p_tenant
   order by t.created_at desc;
$$;

create or replace function app.op_periods(p_tenant uuid)
returns table (
  id uuid, month date, plan text, quantity numeric, net_cents integer, gross_cents integer,
  tax_kind text, status text, hold_reason text, invoice_number text, attempts integer,
  last_error text, updated_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select id, month, plan, quantity, net_cents, gross_cents, tax_kind, status, hold_reason,
         invoice_number, attempts, last_error, updated_at
    from billing_period where tenant_id = p_tenant order by month desc;
$$;

create or replace function app.op_audit_log(p_tenant uuid)
returns table (at timestamptz, operator text, action text, detail jsonb)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select a.at, o.display_name, a.action, a.detail
    from operator_audit a join operator o on o.id = a.operator_id
   where a.tenant_id = p_tenant order by a.at desc limit 100;
$$;

-- Pausing: everybody reads, nobody writes. Billing continues.
create or replace function app.op_set_paused(p_operator uuid, p_tenant uuid, p_paused boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_paused then
    update tenant_lifecycle set state_before = state, state = 'paused', updated_at = now()
     where tenant_id = p_tenant and state not in ('paused', 'deleting');
  else
    update tenant_lifecycle set state = coalesce(state_before, 'active'), state_before = null, updated_at = now()
     where tenant_id = p_tenant and state = 'paused';
  end if;
  if found then
    perform app.op_audit(p_operator, case when p_paused then 'pause' else 'unpause' end, p_tenant,
                         jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

-- Blocking: nobody gets in, every session ends at its next request.
create or replace function app.op_set_blocked(p_operator uuid, p_tenant uuid, p_blocked boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update tenant set status = case when p_blocked then 'suspended' else 'active' end, updated_at = now()
   where id = p_tenant and status <> case when p_blocked then 'suspended' else 'active' end;
  if found then
    perform app.op_audit(p_operator, case when p_blocked then 'block' else 'unblock' end, p_tenant,
                         jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

create or replace function app.op_extend_trial(p_operator uuid, p_tenant uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_days < 1 or p_days > 90 then
    raise exception 'extend a trial by 1 to 90 days' using errcode = '22023';
  end if;
  update tenant_lifecycle
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days),
         state = case when state = 'read_only' then 'trial' else state end,
         updated_at = now()
   where tenant_id = p_tenant and state in ('trial', 'read_only');
  if found then
    perform app.op_audit(p_operator, 'extend_trial', p_tenant, jsonb_build_object('days', p_days));
  end if;
end;
$$;

create or replace function app.op_schedule_deletion(p_operator uuid, p_tenant uuid, p_days integer, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare until timestamptz;
begin
  if p_days < 0 or p_days > 90 then
    raise exception 'a grace period of 0 to 90 days' using errcode = '22023';
  end if;
  until := app.cloud_schedule_tenant_deletion(p_tenant, p_days);
  perform app.op_audit(p_operator, 'schedule_deletion', p_tenant,
                       jsonb_build_object('days', p_days, 'reason', p_reason));
  return until;
end;
$$;

create or replace function app.op_cancel_deletion(p_operator uuid, p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.cloud_cancel_tenant_deletion(p_tenant);
  perform app.op_audit(p_operator, 'cancel_deletion', p_tenant, '{}');
end;
$$;

-- A held period after review: bill it after all, or drop it.
create or replace function app.op_release_period(p_operator uuid, p_period uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare tenant uuid;
begin
  if p_decision not in ('bill', 'void') then
    raise exception 'bill or void' using errcode = '22023';
  end if;
  update billing_period
     set status = case when p_decision = 'bill' then 'computed' else 'void' end,
         hold_reason = null, updated_at = now()
   where id = p_period and status = 'held'
  returning tenant_id into tenant;
  if tenant is not null then
    perform app.op_audit(p_operator, 'release_period_' || p_decision, tenant,
                         jsonb_build_object('period', p_period));
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'app.op_audit(uuid, text, uuid, jsonb)',
    'app.op_tenants(uuid)',
    'app.op_periods(uuid)',
    'app.op_audit_log(uuid)',
    'app.op_set_paused(uuid, uuid, boolean, text)',
    'app.op_set_blocked(uuid, uuid, boolean, text)',
    'app.op_extend_trial(uuid, uuid, integer)',
    'app.op_schedule_deletion(uuid, uuid, integer, text)',
    'app.op_cancel_deletion(uuid, uuid)',
    'app.op_release_period(uuid, uuid, text)'
  ] loop
    execute format('alter function %s owner to gw_ops', f);
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to gw_operator', f);
  end loop;
end
$$;
