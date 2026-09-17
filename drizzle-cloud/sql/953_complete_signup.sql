-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Turning a confirmed registration into a workspace, atomically.
--
-- One function because every step crosses a boundary the application's roles
-- are built not to cross in one transaction: the signup and the identity are
-- auth material, the tenant, the membership and the lifecycle are tenant data,
-- and the billing account is written by nobody but this and the billing run.
-- Doing it in one place is what makes "a confirmed link produces exactly one
-- workspace, or nothing" true under a double click.
--
-- Outcomes:
--   created -- a new tenant, its admin and its trial
--   exists  -- the address already belongs to a workspace; nothing was created
--   invalid -- unknown, expired or already used
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.cloud_complete_signup(p_token_hash text)
returns table (tenant_id uuid, identity_id uuid, outcome text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  s pending_signup%rowtype;
  p jsonb;
  v_tenant uuid := gen_random_uuid();
  v_identity uuid;
begin
  update pending_signup
     set consumed_at = now()
   where token_hash = p_token_hash
     and consumed_at is null
     and expires_at > now()
  returning * into s;

  if not found then
    return query select null::uuid, null::uuid, 'invalid'::text;
    return;
  end if;

  p := s.payload;

  select i.id into v_identity from identity i where i.email = s.email for update;

  if v_identity is not null and exists (select 1 from member m where m.identity_id = v_identity) then
    return query select null::uuid, v_identity, 'exists'::text;
    return;
  end if;

  if v_identity is null then
    v_identity := gen_random_uuid();
    insert into identity (id, email, email_verified_at, locale)
    values (v_identity, s.email, now(), coalesce(p ->> 'locale', 'de'));
  else
    update identity set email_verified_at = coalesce(email_verified_at, now()) where id = v_identity;
  end if;

  perform set_config('app.tenant_id', v_tenant::text, true);

  insert into tenant (id, slug, name)
  values (v_tenant, 'ws-' || substr(replace(v_tenant::text, '-', ''), 1, 16), p ->> 'workspaceName');

  insert into member (id, tenant_id, identity_id, role, status, first_name, last_name)
  values (gen_random_uuid(), v_tenant, v_identity, 'admin', 'active', p ->> 'firstName', p ->> 'lastName');

  insert into tenant_lifecycle (tenant_id, state, trial_ends_at)
  values (v_tenant, 'trial', now() + make_interval(days => (p ->> 'trialDays')::int));

  insert into billing_account (
    tenant_id, customer_type, company_name, street, postal_code, city, country, vat_id,
    billing_email, plan, plan_from, terms_accepted_at, dpa_accepted_at, early_start_requested_at
  ) values (
    v_tenant,
    p ->> 'customerType',
    p ->> 'companyName',
    p ->> 'street',
    p ->> 'postalCode',
    p ->> 'city',
    p ->> 'country',
    p ->> 'vatId',
    s.email,
    p ->> 'plan',
    current_date,
    s.created_at,
    case when (p ->> 'acceptedDpa')::boolean then s.created_at end,
    case when (p ->> 'requestedEarlyStart')::boolean then s.created_at end
  );

  -- The VIES answer the registration was checked against, as evidence, and
  -- the status it gives. No answer yet ("unavailable") leaves it pending for
  -- the billing worker to ask again.
  if p ? 'vatCheck' then
    insert into vat_check (tenant_id, vat_id, result, name, address, consultation_number, error, checked_at)
    values (
      v_tenant,
      p -> 'vatCheck' ->> 'vatId',
      p -> 'vatCheck' ->> 'status',
      p -> 'vatCheck' ->> 'name',
      p -> 'vatCheck' ->> 'address',
      p -> 'vatCheck' ->> 'consultationNumber',
      p -> 'vatCheck' ->> 'error',
      (p -> 'vatCheck' ->> 'checkedAt')::timestamptz
    );
    update billing_account
       set vat_status = case p -> 'vatCheck' ->> 'status'
                          when 'valid' then 'valid'
                          when 'invalid' then 'invalid'
                          else 'pending'
                        end
     where billing_account.tenant_id = v_tenant;
  end if;

  insert into tax_evidence (tenant_id, kind, country, recorded_at)
  values (v_tenant, 'billing_address', p ->> 'country', s.created_at);

  return query select v_tenant, v_identity, 'created'::text;
end;
$$;

alter function app.cloud_complete_signup(text) owner to gw_ops;
revoke all on function app.cloud_complete_signup(text) from public;
grant execute on function app.cloud_complete_signup(text) to gw_app;
