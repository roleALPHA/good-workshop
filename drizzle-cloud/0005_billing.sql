-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Counting what is billed, and billing it.
--
-- Usage is recorded by triggers on the community tables, so every path that
-- creates a workshop or changes a membership counts -- the editor, MCP, a copy,
-- the CLI -- without any of them knowing billing exists.
--
-- Like the other bookkeeping tables: no foreign keys to tenant, member or
-- workshop. A deleted workshop was still created that month, and a deleted
-- member was still active on the days they were.
-- ═══════════════════════════════════════════════════════════════════════════

-- When each member was active. One open interval (active_to is null) per
-- member at most.
create table usage_member_interval (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  member_id uuid not null,
  active_from timestamptz not null,
  active_to timestamptz,
  check (active_to is null or active_to >= active_from)
);
create unique index usage_member_interval_open_uq
  on usage_member_interval (member_id) where active_to is null;
create index usage_member_interval_tenant_idx on usage_member_interval (tenant_id, active_from);

-- Every workshop ever created, and whether the tenant was still in its trial.
create table usage_workshop_created (
  workshop_id uuid primary key,
  tenant_id uuid not null,
  created_at timestamptz not null,
  in_trial boolean not null
);
create index usage_workshop_created_tenant_idx on usage_workshop_created (tenant_id, created_at);

-- One month of one tenant, from computed to paid. The invoice ref is the
-- idempotency key towards the accounting and payment systems: a run that is
-- repeated finds the invoice and the charge it already made.
create table billing_period (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  month date not null check (extract(day from month) = 1),
  plan text not null check (plan in ('per_user', 'per_workshop')),
  quantity numeric(12, 2) not null check (quantity >= 0),
  unit_net_cents integer not null check (unit_net_cents >= 0),
  net_cents integer not null check (net_cents >= 0),
  tax_kind text not null check (tax_kind in ('domestic', 'reverse_charge', 'oss', 'export', 'hold')),
  tax_country text,
  tax_rate numeric(6, 4),
  status text not null check (status in ('computed', 'held', 'void', 'invoiced', 'charging', 'paid', 'failed')),
  hold_reason text,
  invoice_ref text not null unique,
  invoice_id text,
  invoice_number text,
  invoice_url text,
  gross_cents integer,
  invoiced_at timestamptz,
  charge_after timestamptz,
  payment_ref text,
  attempts integer not null default 0,
  last_error text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, month)
);
create index billing_period_status_idx on billing_period (status, charge_after);

-- What the payment provider told us, verified and stored before it is acted on.
create table payment_event (
  id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table billing_account
  add column invoicing_customer_ref text,
  add column payment_customer_ref text,
  add column payment_method_ready boolean not null default false,
  add column reminders_sent text[] not null default '{}';

do $$
declare t text;
begin
  foreach t in array array['usage_member_interval', 'usage_workshop_created', 'billing_period', 'payment_event'] loop
    execute format('alter table %I owner to gw_owner', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end
$$;

-- A tenant reads its own usage and invoices (the billing page); nothing is
-- written by the application role.
create policy usage_member_interval_tenant on usage_member_interval
  for select to gw_app using (tenant_id = app.current_tenant());
create policy usage_workshop_created_tenant on usage_workshop_created
  for select to gw_app using (tenant_id = app.current_tenant());
create policy billing_period_tenant on billing_period
  for select to gw_app using (tenant_id = app.current_tenant());
-- payment_event: no policy for gw_app at all. Stored through
-- app.cloud_record_payment_event, read by the billing worker.
create policy payment_event_none on payment_event
  for select to gw_app using (false);

-- Members already active when billing starts are active from now on.
insert into usage_member_interval (tenant_id, member_id, active_from)
select tenant_id, id, now() from member where status = 'active';
