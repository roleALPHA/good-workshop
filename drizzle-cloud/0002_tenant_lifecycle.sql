-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Where a tenant is in its commercial life.
--
--   trial      -- the first days after registration, free
--   active     -- paying
--   read_only  -- the trial ran out, or payment failed: everything can be read
--                 and exported, nothing can be changed
--
-- Suspension is not a state here. It already exists as tenant.status =
-- 'suspended' in the community schema, and every sign-in and token path checks
-- that column; a second place saying the same thing would be a second place to
-- forget.
--
-- No row means no restriction: a tenant created by hand, or before this table
-- existed, is not locked out by its absence.
-- ═══════════════════════════════════════════════════════════════════════════

create table tenant_lifecycle (
  tenant_id uuid primary key references tenant (id) on delete cascade,
  state text not null default 'trial' check (state in ('trial', 'active', 'read_only')),
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cloud migrations run on the admin connection; the table belongs to the role
-- that owns every other one, so migrate.mjs can FORCE its row level security.
alter table tenant_lifecycle owner to gw_owner;
alter table tenant_lifecycle enable row level security;

-- The application may read its own tenant's state -- to say "read only" on
-- screen -- and write nothing. State changes come from the billing worker and
-- the operator console, which do not run as gw_app.
create policy tenant_lifecycle_tenant_isolation on tenant_lifecycle
  for select to gw_app
  using (tenant_id = app.current_tenant());
