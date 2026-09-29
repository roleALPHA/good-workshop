-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Vouchers: a percentage off the monthly invoice.
--
-- The console creates them, a workspace admin redeems one next to the payment
-- method, and the billing run applies it when it closes a month. A voucher can
-- be redeemed once, n times or without limit, until a date or for ever, and
-- then discounts for n months or for as long as the workspace is billed.
--
-- 0030, not 0020: the private build copies its own numbered files into this
-- directory and they already take 0020 to 0029.
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per code, for the whole installation: no tenant_id.
create table voucher (
  id uuid primary key default gen_random_uuid(),
  -- Upper case, trimmed; what a customer types is normalised the same way.
  code text not null unique check (code ~ '^[A-Z0-9-]{4,32}$'),
  percent integer not null check (percent between 1 and 100),
  -- How many billed months it discounts. Null: every month, for good.
  duration_months integer check (duration_months >= 1),
  -- Until when it can be redeemed. Null: as long as it is not revoked.
  redeemable_until timestamptz,
  -- How many workspaces may redeem it. Null: any number; 1 is a single-use code.
  max_redemptions integer check (max_redemptions >= 1),
  -- For us, never shown to a customer: who it was for, which campaign.
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  -- Stops new redemptions. The ones already made keep running: a discount a
  -- customer was given is not taken back by tidying up a list.
  revoked_at timestamptz
);

-- Which workspace redeemed which voucher. Bookkeeping, like billing_period:
-- no foreign key to tenant, because it has to outlive a deleted workspace
-- (§ 132 BAO), and the voucher's terms are copied, because the invoice was
-- computed from them and they must still say so after the voucher is gone.
create table voucher_redemption (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  voucher_id uuid not null references voucher (id),
  code text not null,
  percent integer not null check (percent between 1 and 100),
  duration_months integer check (duration_months >= 1),
  redeemed_at timestamptz not null default now(),
  -- The Vienna month it was redeemed in: the first month it discounts.
  redeemed_month date not null check (extract(day from redeemed_month) = 1),
  unique (voucher_id, tenant_id)
);
create index voucher_redemption_tenant_idx on voucher_redemption (tenant_id, redeemed_at desc);

-- What the run applied to a month. net_cents is the amount after the discount,
-- so everything downstream -- void at zero, the plausibility check against the
-- invoice, the charge -- works on what is actually owed.
alter table billing_period
  add column voucher_redemption_id uuid references voucher_redemption (id),
  add column discount_percent integer check (discount_percent between 1 and 100),
  add column voucher_code text;
create index billing_period_voucher_idx on billing_period (voucher_redemption_id)
  where voucher_redemption_id is not null;

do $$
declare t text;
begin
  foreach t in array array['voucher', 'voucher_redemption'] loop
    execute format('alter table %I owner to gw_owner', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end
$$;

-- The application role holds blanket table grants (scripts/migrate.mjs), so
-- the codes are kept from it by a policy that matches nothing: a workspace that
-- could read this table could read every other workspace's code. Redeeming
-- goes through app.cloud_redeem_voucher.
create policy voucher_none on voucher for select to gw_app using (false);

-- A workspace reads its own redemption, for the billing page.
create policy voucher_redemption_tenant on voucher_redemption
  for select to gw_app using (tenant_id = app.current_tenant());
