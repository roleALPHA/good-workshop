-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. The few things a tenant admin changes about billing and the
-- workspace itself. Re-applied on every run.
--
-- The application role only reads billing_account and tenant_lifecycle; these
-- functions are the writes, and each one acts on app.current_tenant() and
-- nothing else, and only for a tenant admin (app.is_tenant_admin(), set by
-- withTenant from the session's role).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.cloud_assert_tenant_admin()
returns uuid
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare tenant uuid := app.current_tenant();
begin
  if tenant is null or not app.is_tenant_admin() then
    raise exception 'tenant admin only' using errcode = '42501';
  end if;
  return tenant;
end;
$$;

-- Chosen now, in force on the first of the coming month -- the run applies it
-- when that date has arrived, not on its next pass. Choosing the plan that is
-- already in force withdraws a pending change instead of queueing one.
create or replace function app.cloud_change_plan(p_plan text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare tenant uuid := app.cloud_assert_tenant_admin();
begin
  update billing_account
     set next_plan = case when plan = p_plan then null else p_plan end,
         next_plan_from = case
           when plan = p_plan then null
           else (date_trunc('month', now() at time zone 'Europe/Vienna') + interval '1 month')::date
         end,
         updated_at = now()
   where tenant_id = tenant;
end;
$$;

create or replace function app.cloud_update_billing_details(
  p_company text, p_street text, p_postal_code text, p_city text, p_country text,
  p_vat_id text, p_billing_email text, p_vat_check jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare tenant uuid := app.cloud_assert_tenant_admin();
begin
  update billing_account
     set company_name = p_company,
         street = p_street,
         postal_code = p_postal_code,
         city = p_city,
         country = p_country,
         vat_id = p_vat_id,
         billing_email = p_billing_email,
         vat_status = case
           when p_vat_id is null then 'none'
           when p_vat_check ->> 'status' = 'valid' then 'valid'
           when p_vat_check ->> 'status' = 'invalid' then 'invalid'
           else 'pending'
         end,
         updated_at = now()
   where tenant_id = tenant;

  if p_vat_check is not null then
    insert into vat_check (tenant_id, vat_id, result, name, address, consultation_number, error, checked_at)
    values (tenant, p_vat_id, p_vat_check ->> 'status', p_vat_check ->> 'name',
            p_vat_check ->> 'address', p_vat_check ->> 'consultationNumber',
            p_vat_check ->> 'error', (p_vat_check ->> 'checkedAt')::timestamptz);
  end if;

  insert into tax_evidence (tenant_id, kind, country) values (tenant, 'billing_address', p_country);
end;
$$;

create or replace function app.cloud_set_payment_customer(p_customer_ref text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare tenant uuid := app.cloud_assert_tenant_admin();
begin
  update billing_account set payment_customer_ref = p_customer_ref, updated_at = now()
   where tenant_id = tenant and payment_customer_ref is null;
end;
$$;

-- Deleting a workspace: read-only at once, gone after the grace period. Usage
-- stops counting now -- nobody is billed for the days a deleted workspace waits.
create or replace function app.cloud_schedule_tenant_deletion(p_tenant uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare until timestamptz := now() + make_interval(days => p_days);
begin
  update tenant_lifecycle
     set state_before = case when state in ('paused', 'deleting') then state_before else state end,
         state = 'deleting',
         deletion_requested_at = now(),
         delete_after = until,
         updated_at = now()
   where tenant_id = p_tenant and state <> 'deleting';

  update usage_member_interval set active_to = now()
   where tenant_id = p_tenant and active_to is null;

  return (select delete_after from tenant_lifecycle where tenant_id = p_tenant);
end;
$$;

create or replace function app.cloud_cancel_tenant_deletion(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update tenant_lifecycle
     set state = coalesce(state_before, 'active'),
         state_before = null,
         deletion_requested_at = null,
         delete_after = null,
         updated_at = now()
   where tenant_id = p_tenant and state = 'deleting';

  if found then
    insert into usage_member_interval (tenant_id, member_id, active_from)
    select m.tenant_id, m.id, now() from member m
     where m.tenant_id = p_tenant and m.status = 'active'
    on conflict do nothing;
  end if;
end;
$$;

-- The tenant admin's versions: their own tenant, admins only.
create or replace function app.cloud_request_own_deletion(p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return app.cloud_schedule_tenant_deletion(app.cloud_assert_tenant_admin(), p_days);
end;
$$;

-- Ending the contract to the end of this calendar month (AGB § 6.2).
--
-- Nothing changes today: the workspace keeps working, members keep counting,
-- and the last month is invoiced in full. What happens when the date arrives is
-- the deletion that already exists -- the billing run schedules it -- so there
-- is exactly one path from "no longer a customer" to "data gone", and it is the
-- one with the export window in it.
create or replace function app.cloud_request_own_cancellation()
returns date
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare tenant uuid := app.cloud_assert_tenant_admin();
begin
  update tenant_lifecycle
     set cancellation_requested_at = now(),
         -- Vienna, like every other month boundary in the billing: asked for at
         -- half past midnight on the first, this must not end the month before.
         contract_ends_on = (date_trunc('month', now() at time zone 'Europe/Vienna')
                             + interval '1 month' - interval '1 day')::date,
         updated_at = now()
   where tenant_id = tenant
     and cancellation_requested_at is null
     and state not in ('deleting');

  return (select contract_ends_on from tenant_lifecycle where tenant_id = tenant);
end;
$$;

-- Taking it back, for as long as the contract is still running. Afterwards
-- there is nothing to take back: the deletion has its own withdrawal.
create or replace function app.cloud_withdraw_own_cancellation()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare tenant uuid := app.cloud_assert_tenant_admin();
begin
  update tenant_lifecycle
     set cancellation_requested_at = null,
         contract_ends_on = null,
         updated_at = now()
   where tenant_id = tenant and state not in ('deleting');
end;
$$;

create or replace function app.cloud_cancel_own_deletion()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.cloud_cancel_tenant_deletion(app.cloud_assert_tenant_admin());
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'app.cloud_change_plan(text)',
    'app.cloud_update_billing_details(text, text, text, text, text, text, text, jsonb)',
    'app.cloud_set_payment_customer(text)',
    'app.cloud_request_own_deletion(integer)',
    'app.cloud_cancel_own_deletion()',
    'app.cloud_request_own_cancellation()',
    'app.cloud_withdraw_own_cancellation()'
  ] loop
    execute format('alter function %s owner to gw_ops', f);
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to gw_app', f);
  end loop;
  -- Operator-only: never granted to the application role.
  foreach f in array array[
    'app.cloud_schedule_tenant_deletion(uuid, integer)',
    'app.cloud_cancel_tenant_deletion(uuid)'
  ] loop
    execute format('alter function %s owner to gw_ops', f);
    execute format('revoke all on function %s from public', f);
  end loop;
end
$$;
