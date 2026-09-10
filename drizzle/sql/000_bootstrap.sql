-- ═══════════════════════════════════════════════════════════════════════════
-- GoodWorkshop — Bootstrap
--
-- Roles, the `app` schema and the accessors every RLS policy is written
-- against. This runs before any table exists and is the foundation the whole
-- tenant boundary rests on.
--
-- Roles are created WITHOUT a password here. Handing out credentials is an
-- operator concern, not a migration concern -- `scripts/db-bootstrap.mjs` sets
-- them from the environment.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists citext;

-- ── Roles ──────────────────────────────────────────────────────────────────
--
-- gw_owner  migrations only. Owns every table, and therefore BYPASSES its own
--           RLS policies unless they are FORCEd. Never used at runtime.
-- gw_app    the application pool. RLS enforced, NOBYPASSRLS, NOINHERIT.
-- gw_auth   entered via SET LOCAL ROLE for the login path only. The global auth
--           tables have no tenant_id and cannot be protected by tenant RLS, so
--           they are protected by grants instead.
-- gw_ops    CLI maintenance and cross-tenant reports. BYPASSRLS. Never in the app.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gw_owner') then
    -- NOINHERIT: gw_owner is a member of gw_ops (needed to hand it ownership
    -- of the one SECURITY DEFINER function) but does not carry that privilege
    -- around unless it explicitly steps into the role.
    create role gw_owner login noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'gw_auth') then
    create role gw_auth nologin nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'gw_app') then
    -- NOINHERIT is load-bearing: gw_app is a member of gw_auth, but the
    -- privilege is only active inside an explicit SET LOCAL ROLE. Without it,
    -- any query in the 95% of the codebase that is not the auth module could
    -- read credential material.
    create role gw_app login noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'gw_ops') then
    create role gw_ops login bypassrls;
  end if;
end
$$;

grant gw_auth to gw_app;

-- So that migrations can hand app.resolve_pat to gw_ops. That function is the
-- only thing in the system allowed to look past RLS, and it can only do so if
-- its OWNER may -- a SECURITY DEFINER function owned by gw_owner sees nothing
-- at all, because FORCE ROW LEVEL SECURITY leaves the owner without an
-- applicable policy.
grant gw_ops to gw_owner;

-- ── The app schema and its accessors ───────────────────────────────────────

create schema if not exists app;
-- gw_owner needs USAGE because the column defaults call app.current_tenant(),
-- and CREATE because app.resolve_pat is (re)created on every migration run.
grant usage on schema app to gw_owner, gw_app, gw_auth, gw_ops;
grant create on schema app to gw_owner;
-- The new owner of a function needs CREATE in its schema, so handing
-- app.resolve_pat to gw_ops requires this.
grant create on schema app to gw_ops;

-- current_setting(..., true) returns NULL when the GUC is unset. `tenant_id =
-- NULL` is NULL, NULL is not true, so an unset tenant yields zero rows on read
-- and a WITH CHECK violation on write. There is no "forgot to set it and got
-- everything" state -- the design is fail-closed by construction.
create or replace function app.current_tenant() returns uuid
  language sql stable parallel safe
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function app.current_member() returns uuid
  language sql stable parallel safe
as $$ select nullif(current_setting('app.member_id', true), '')::uuid $$;

create or replace function app.is_tenant_admin() returns boolean
  language sql stable parallel safe
as $$ select coalesce(nullif(current_setting('app.is_tenant_admin', true), '')::boolean, false) $$;

-- A leaked session variable must resolve to "no tenant" rather than to a stale
-- one. Belt and braces on top of always using SET LOCAL.
do $$
begin
  execute format('alter database %I set app.tenant_id = %L', current_database(), '');
  execute format('alter database %I set app.member_id = %L', current_database(), '');
  execute format('alter database %I set app.is_tenant_admin = %L', current_database(), 'off');
end
$$;

-- ── Grants for tables the migrations have not created yet ──────────────────
--
-- Without this, every NEW table is invisible to gw_app: it 500s in production
-- and works in development, where people tend to run as a superuser.
alter default privileges for role gw_owner in schema public
  grant select, insert, update, delete on tables to gw_app;
alter default privileges for role gw_owner in schema public
  grant usage, select on sequences to gw_app;
-- gw_ops is the maintenance role, not a reporting role: repairing data across
-- tenants is exactly what it exists for.
alter default privileges for role gw_owner in schema public
  grant select, insert, update, delete on tables to gw_ops;
alter default privileges for role gw_owner in schema public
  grant usage, select on sequences to gw_ops;

grant usage on schema public to gw_owner, gw_app, gw_auth, gw_ops;
