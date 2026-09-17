-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Registering, and what a registration leaves behind.
--
-- pending_signup holds a registration between the form and the click on the
-- confirmation link. Nothing else exists yet at that point -- no identity, no
-- tenant -- so an address somebody typed but never confirmed creates nothing
-- but this row, and the row expires.
--
-- billing_account is who pays and on what terms: the customer type, the billing
-- address, the VAT number, the plan and the consents given at registration,
-- which are evidence and are kept. Deliberately without a foreign key to
-- tenant: bookkeeping records outlive a deleted workspace (§ 132 BAO), and a
-- cascade would delete them with it.
-- ═══════════════════════════════════════════════════════════════════════════

create table pending_signup (
  id uuid primary key,
  token_hash text not null unique,
  email citext not null,
  payload jsonb not null,
  requested_ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index pending_signup_email_idx on pending_signup (email, created_at);
alter table pending_signup owner to gw_owner;
alter table pending_signup enable row level security;

-- Like the other sign-in material (identity, email_token): not the application
-- role's to read, only the auth role's.
create policy pending_signup_auth on pending_signup
  for all to gw_auth
  using (true)
  with check (true);

create table billing_account (
  tenant_id uuid primary key,
  customer_type text not null check (customer_type in ('business', 'consumer')),
  company_name text,
  street text not null,
  postal_code text not null,
  city text not null,
  country text not null,
  vat_id text,
  billing_email citext not null,
  plan text not null check (plan in ('per_user', 'per_workshop')),
  plan_from date not null,
  terms_accepted_at timestamptz not null,
  dpa_accepted_at timestamptz,
  early_start_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table billing_account owner to gw_owner;
alter table billing_account enable row level security;

-- The tenant reads its own billing account; changes go through functions.
create policy billing_account_tenant_isolation on billing_account
  for select to gw_app
  using (tenant_id = app.current_tenant());
