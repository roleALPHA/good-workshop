-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Which workspace was told about which announced price.
--
-- The billing run passes every ten minutes, so "tell everybody about the new
-- price" needs somewhere to remember that it did -- otherwise the customer
-- hears about the same change 144 times a day. The same job `reminders_sent`
-- does for the trial, and `legal_acknowledgement` does for the terms.
--
-- Keyed by the month the price starts in, not by when it was announced: if
-- accounting corrects itself before the date arrives, the row is replaced and
-- the correction goes out.
-- ═══════════════════════════════════════════════════════════════════════════

create table price_change_notice (
  tenant_id uuid not null references tenant(id) on delete cascade,
  plan text not null check (plan in ('per_user', 'per_workshop')),
  effective_from date not null,
  net_cents integer not null,
  announced_at timestamptz not null default now(),
  primary key (tenant_id, plan, effective_from)
);

alter table price_change_notice owner to gw_owner;
alter table price_change_notice enable row level security;

-- Its own, so the workspace can be shown what was announced to it.
create policy price_change_notice_tenant on price_change_notice
  for select to gw_app using (tenant_id = app.current_tenant());

grant select on price_change_notice to gw_app;
grant select, insert, delete on price_change_notice to gw_ops;

-- ── A version of a legal text, put into force ──────────────────────────────
-- The console decides, the billing worker tells. They are different database
-- roles on purpose -- gw_operator has no grant on any tenant table, and the
-- worker never serves a request -- so the decision is a row and the sending is
-- a step of the run.
create table legal_announcement (
  id uuid primary key default gen_random_uuid(),
  document text not null check (document in ('impressum', 'agb', 'datenschutz', 'avv')),
  version text not null,
  effective_from date not null,
  announced_by uuid,
  created_at timestamptz not null default now(),
  -- When the run finished telling everybody, and how many that was.
  completed_at timestamptz,
  told integer,
  unique (document, version)
);

alter table legal_announcement owner to gw_owner;
grant select, insert, update on legal_announcement to gw_ops;
