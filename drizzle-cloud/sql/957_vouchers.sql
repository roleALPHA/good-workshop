-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Vouchers: redeemed by a workspace admin, managed from the console.
--
-- Re-applied on every migration run. Owned by gw_ops, like the other cloud
-- functions: the application role cannot read the voucher table at all
-- (0030_vouchers.sql), so everything it may do with a code happens here.
-- ═══════════════════════════════════════════════════════════════════════════

-- Whether a redemption still discounts: for good, or until as many months have
-- been billed with it as it runs for.
create or replace function app.voucher_redemption_running(p_redemption uuid, p_duration integer)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select p_duration is null
      or (select count(*) from billing_period where voucher_redemption_id = p_redemption) < p_duration;
$$;

-- Redeems a code for the caller's workspace. Admins only.
--
-- The refusals are message keys, in the order a customer can do something
-- about them. An unknown and a revoked code are the same refusal on purpose:
-- which codes exist is not something to find out by trying.
create or replace function app.cloud_redeem_voucher(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  tenant uuid := app.cloud_assert_tenant_admin();
  v voucher%rowtype;
  used integer;
  month date := date_trunc('month', now() at time zone 'Europe/Vienna')::date;
begin
  -- One redemption at a time per workspace: two codes submitted at once must
  -- not both find that nothing is running yet.
  perform 1 from billing_account where tenant_id = tenant for update;

  -- And one at a time per voucher, so the last use of a single-use code is
  -- spent once.
  select * into v from voucher where code = upper(btrim(p_code)) for update;
  if not found or v.revoked_at is not null then
    raise exception 'voucher_unknown' using errcode = '22023';
  end if;
  if v.redeemable_until is not null and v.redeemable_until <= now() then
    raise exception 'voucher_expired' using errcode = '22023';
  end if;
  if exists (select 1 from voucher_redemption where voucher_id = v.id and tenant_id = tenant) then
    raise exception 'voucher_already_redeemed' using errcode = '22023';
  end if;
  if v.max_redemptions is not null then
    select count(*) into used from voucher_redemption where voucher_id = v.id;
    if used >= v.max_redemptions then
      raise exception 'voucher_exhausted' using errcode = '22023';
    end if;
  end if;
  if exists (select 1 from voucher_redemption r
              where r.tenant_id = tenant
                and app.voucher_redemption_running(r.id, r.duration_months)) then
    raise exception 'voucher_active' using errcode = '22023';
  end if;

  insert into voucher_redemption (tenant_id, voucher_id, code, percent, duration_months, redeemed_month)
  values (tenant, v.id, v.code, v.percent, v.duration_months, month);

  return jsonb_build_object('code', v.code, 'percent', v.percent, 'durationMonths', v.duration_months);
end;
$$;

create or replace function app.op_vouchers()
returns table (
  id uuid, code text, percent integer, duration_months integer, redeemable_until timestamptz,
  max_redemptions integer, note text, created_at timestamptz, revoked_at timestamptz,
  created_by text, redemptions integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select v.id, v.code, v.percent, v.duration_months, v.redeemable_until, v.max_redemptions,
         v.note, v.created_at, v.revoked_at, o.display_name,
         (select count(*)::integer from voucher_redemption r where r.voucher_id = v.id)
    from voucher v left join operator o on o.id = v.created_by
   order by v.revoked_at is not null, v.created_at desc;
$$;

create or replace function app.op_create_voucher(
  p_operator uuid, p_code text, p_percent integer, p_duration_months integer,
  p_redeemable_until timestamptz, p_max_redemptions integer, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  id uuid;
  normalised text := upper(btrim(p_code));
begin
  if normalised !~ '^[A-Z0-9-]{4,32}$' then
    raise exception 'a code is 4 to 32 letters, digits or dashes' using errcode = '22023';
  end if;
  if p_percent is null or p_percent not between 1 and 100 then
    raise exception 'a discount is 1 to 100 percent' using errcode = '22023';
  end if;
  if p_duration_months is not null and p_duration_months < 1 then
    raise exception 'a voucher runs for at least a month' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions < 1 then
    raise exception 'a voucher can be redeemed at least once' using errcode = '22023';
  end if;
  if p_redeemable_until is not null and p_redeemable_until <= now() then
    raise exception 'a voucher that has already expired helps nobody' using errcode = '22023';
  end if;
  if exists (select 1 from voucher where code = normalised) then
    raise exception 'voucher code taken' using errcode = '23505';
  end if;

  insert into voucher (code, percent, duration_months, redeemable_until, max_redemptions, note, created_by)
  values (normalised, p_percent, p_duration_months, p_redeemable_until, p_max_redemptions,
          coalesce(p_note, ''), p_operator)
  returning voucher.id into id;

  perform app.op_audit(p_operator, 'create_voucher', null,
                       jsonb_build_object('code', normalised, 'percent', p_percent,
                                          'durationMonths', p_duration_months,
                                          'redeemableUntil', p_redeemable_until,
                                          'maxRedemptions', p_max_redemptions));
  return id;
end;
$$;

create or replace function app.op_revoke_voucher(p_operator uuid, p_voucher uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare revoked text;
begin
  update voucher set revoked_at = now()
   where id = p_voucher and revoked_at is null
  returning code into revoked;
  if revoked is not null then
    perform app.op_audit(p_operator, 'revoke_voucher', null, jsonb_build_object('code', revoked));
  end if;
end;
$$;

-- What a workspace has redeemed, and how much of it is used up.
create or replace function app.op_voucher_redemptions(p_tenant uuid)
returns table (
  code text, percent integer, duration_months integer, redeemed_at timestamptz,
  months_used integer, running boolean
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select r.code, r.percent, r.duration_months, r.redeemed_at,
         (select count(*)::integer from billing_period p where p.voucher_redemption_id = r.id),
         app.voucher_redemption_running(r.id, r.duration_months)
    from voucher_redemption r
   where r.tenant_id = p_tenant
   order by r.redeemed_at desc;
$$;

do $$
declare f text;
begin
  execute 'alter function app.voucher_redemption_running(uuid, integer) owner to gw_ops';
  execute 'revoke all on function app.voucher_redemption_running(uuid, integer) from public';

  execute 'alter function app.cloud_redeem_voucher(text) owner to gw_ops';
  execute 'revoke all on function app.cloud_redeem_voucher(text) from public';
  execute 'grant execute on function app.cloud_redeem_voucher(text) to gw_app';

  foreach f in array array[
    'app.op_vouchers()',
    'app.op_create_voucher(uuid, text, integer, integer, timestamptz, integer, text)',
    'app.op_revoke_voucher(uuid, uuid)',
    'app.op_voucher_redemptions(uuid)'
  ] loop
    execute format('alter function %s owner to gw_ops', f);
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to gw_operator', f);
  end loop;
end
$$;
