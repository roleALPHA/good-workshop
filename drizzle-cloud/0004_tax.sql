-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. What the VAT on an invoice is decided from, kept as evidence.
--
-- vat_check: every VIES answer, including "could not ask", never updated. The
-- consultation number of a valid answer is what proves reverse charge was
-- applied to a number that was valid on that day.
--
-- tax_evidence: where a consumer is, as the tax rules ask it to be shown --
-- the billing address, later the country of the payment method.
--
-- Both are bookkeeping records and, like billing_account, carry no foreign key
-- to tenant: they outlive a deleted workspace.
-- ═══════════════════════════════════════════════════════════════════════════

alter table billing_account
  add column vat_status text not null default 'none'
    check (vat_status in ('none', 'valid', 'invalid', 'pending'));

create table vat_check (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vat_id text not null,
  result text not null check (result in ('valid', 'invalid', 'unavailable')),
  name text,
  address text,
  consultation_number text,
  error text,
  checked_at timestamptz not null
);
create index vat_check_tenant_idx on vat_check (tenant_id, checked_at desc);
alter table vat_check owner to gw_owner;
alter table vat_check enable row level security;
create policy vat_check_tenant_isolation on vat_check
  for select to gw_app
  using (tenant_id = app.current_tenant());

create table tax_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null check (kind in ('billing_address', 'payment_method')),
  country text not null,
  recorded_at timestamptz not null default now()
);
create index tax_evidence_tenant_idx on tax_evidence (tenant_id, recorded_at desc);
alter table tax_evidence owner to gw_owner;
alter table tax_evidence enable row level security;
create policy tax_evidence_tenant_isolation on tax_evidence
  for select to gw_app
  using (tenant_id = app.current_tenant());
