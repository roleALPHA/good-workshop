-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. The triggers that record usage. Re-applied on every run.
--
-- SECURITY DEFINER: the application role writes member and workshop rows but
-- may not write the usage tables, which is the point -- a tenant cannot make
-- its own usage smaller.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.cloud_track_member_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  was_active boolean := tg_op in ('UPDATE', 'DELETE') and old.status = 'active';
  is_active boolean := tg_op in ('INSERT', 'UPDATE') and new.status = 'active';
  member uuid := coalesce(new.id, old.id);
begin
  if was_active and not is_active then
    update usage_member_interval set active_to = now()
     where member_id = member and active_to is null;
  elsif is_active and not was_active then
    insert into usage_member_interval (tenant_id, member_id, active_from)
    values (new.tenant_id, new.id, now())
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists cloud_track_member_activity on member;
create trigger cloud_track_member_activity
  after insert or update of status or delete on member
  for each row execute function app.cloud_track_member_activity();

create or replace function app.cloud_track_workshop_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into usage_workshop_created (workshop_id, tenant_id, created_at, in_trial)
  values (
    new.id,
    new.tenant_id,
    now(),
    coalesce((select l.state = 'trial' from tenant_lifecycle l where l.tenant_id = new.tenant_id), false)
  )
  on conflict (workshop_id) do nothing;
  return null;
end;
$$;

drop trigger if exists cloud_track_workshop_created on workshop;
create trigger cloud_track_workshop_created
  after insert on workshop
  for each row execute function app.cloud_track_workshop_created();

-- The web container stores a verified webhook. It acts on exactly one thing in
-- it: that a payment method now exists. That is not a decision -- it is what
-- the provider just said, and the page the customer returns to has to be able
-- to say it. While the billing run alone wrote it down, somebody who had just
-- paid came back to "no payment method yet" for as long as the run's interval,
-- and tried again.
--
-- Everything that *is* a decision stays with the run, which is why the event is
-- left unprocessed here: the country as tax evidence, and unlocking a workspace
-- that was locked for want of a payment method -- one locked over failed
-- payments must stay locked, and settleBlocked is the single judge of that.
--
-- The tenant is taken from the payload, which is sound because the signature
-- was verified and the id is the one we ourselves put on the session.
create or replace function app.cloud_record_payment_event(p_id text, p_type text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare stored boolean;
begin
  insert into payment_event (id, type, payload) values (p_id, p_type, p_payload)
  on conflict (id) do nothing;
  stored := found;

  -- Only on the first storing: a repeated delivery must not undo what the run
  -- has since made of it.
  if stored and p_type = 'payment_method_ready' then
    update billing_account
       set payment_method_ready = true,
           payment_customer_ref = p_payload ->> 'customerRef',
           updated_at = now()
     where tenant_id = (p_payload ->> 'tenantId')::uuid;
  end if;
end;
$$;

alter function app.cloud_track_member_activity() owner to gw_ops;
alter function app.cloud_track_workshop_created() owner to gw_ops;
alter function app.cloud_record_payment_event(text, text, jsonb) owner to gw_ops;
revoke all on function app.cloud_track_member_activity() from public;
revoke all on function app.cloud_track_workshop_created() from public;
revoke all on function app.cloud_record_payment_event(text, text, jsonb) from public;
grant execute on function app.cloud_record_payment_event(text, text, jsonb) to gw_app;
