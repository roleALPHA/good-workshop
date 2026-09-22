-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Which version of a legal text a customer agreed to.
--
-- `terms_accepted_at` said WHEN somebody agreed, never TO WHAT. The only record
-- of the wording was the welcome mail in their inbox -- ours to hope they kept.
-- A change with a right to object (AGB § 14) cannot be proven against a consent
-- that does not name a version.
--
-- The version is the date of the `Stand:` line of the published text, as
-- YYYY-MM-DD. A text, not a date column: it points at a document rather than at
-- a moment, and it is read from the file the reader was shown.
-- ═══════════════════════════════════════════════════════════════════════════

alter table billing_account
  add column terms_version text,
  add column dpa_version text;

-- A consent without a version is one from before this migration. Both go
-- together from here on, and the check says so for the terms, which are never
-- optional. The DPA is: `dpa_accepted_at` may be null.
alter table billing_account
  add constraint billing_account_dpa_versioned
    check (dpa_version is null or dpa_accepted_at is not null);

-- ── Everything agreed to after the registration ────────────────────────────
-- A workspace agrees once when it registers, and again whenever we announce a
-- new version of a text. The first lives on billing_account, because it is part
-- of the order; the rest belong in a list, because there is no last one.
--
-- Not tenant content: it is written by the billing worker and by the operator
-- console. A workspace reads its own, because the banner that announces a new
-- version has to know which one it is announcing -- and nothing more.
create table legal_acknowledgement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  document text not null check (document in ('impressum', 'agb', 'datenschutz', 'avv')),
  version text not null,
  -- When the customer was told, and when the version began to apply. Six weeks
  -- lie between them (AGB § 14.3); keeping both is what makes that checkable.
  announced_at timestamptz not null default now(),
  effective_from date not null,
  objected_at timestamptz,
  unique (tenant_id, document, version)
);

alter table legal_acknowledgement owner to gw_owner;
alter table legal_acknowledgement enable row level security;

-- Reads its own, writes none: announcing a version is ours to do, and objecting
-- to one goes through a function rather than through a row the tenant writes.
create policy legal_acknowledgement_tenant on legal_acknowledgement
  for select to gw_app using (tenant_id = app.current_tenant());

grant select on legal_acknowledgement to gw_app;
grant select, insert, update on legal_acknowledgement to gw_ops;
