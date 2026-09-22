-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Planned maintenance, announced before it happens.
--
-- AGB § 3.3: "Planbare Wartungsarbeiten kündigen wir nach Möglichkeit im
-- Voraus an." There was no way to. The only thing that could ever appear under
-- the header was a lifecycle state -- trial, read-only, deletion -- so the
-- promise had no mechanism behind it at all.
--
-- Not tenant data: one window applies to everybody, so there is no tenant_id
-- and no policy. gw_app reads it, the console writes it.
-- ═══════════════════════════════════════════════════════════════════════════

create table maintenance_window (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- What to expect, in the operator's words. Shown as written, so it has to be
  -- understandable to a customer rather than to us.
  note text not null default '',
  announced_by uuid,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

alter table maintenance_window owner to gw_owner;

-- Everybody sees the same window, so this is a grant and not a policy.
grant select on maintenance_window to gw_app;
grant select, insert, update on maintenance_window to gw_ops;

create index maintenance_window_upcoming on maintenance_window (ends_at)
  where cancelled_at is null;
