-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. The tenant behind a credential, asked before any tenant context
-- exists -- the same bootstrap problem app.resolve_pat solves for personal
-- access tokens (drizzle/sql/900_pat_resolver.sql), and solved the same way.
--
-- Each function takes the one thing a caller holds -- an identity that just
-- proved itself, the hash of a share link, of an authorization code, the public
-- key of an OAuth token -- and returns a tenant id and nothing else. The rows
-- themselves are then read inside that tenant, under its policies, like any
-- other row. Re-applied on every migration run, like the core resolvers.
-- ═══════════════════════════════════════════════════════════════════════════

-- Disabled memberships and suspended tenants open nothing. An invited
-- membership does: following the invitation is how it becomes active.
create or replace function app.cloud_tenant_for_identity(p_identity_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select m.tenant_id
  from member m
  join tenant t on t.id = m.tenant_id
  where m.identity_id = p_identity_id
    and m.status <> 'disabled'
    and t.status = 'active'
  limit 1;
$$;

create or replace function app.cloud_tenant_for_share_token(p_token_hash text)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.tenant_id
  from workshop_share_link l
  join tenant t on t.id = l.tenant_id
  where l.token_hash = p_token_hash
    and t.status = 'active';
$$;

create or replace function app.cloud_tenant_for_authorization_code(p_code_hash text)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select g.tenant_id
  from oauth_grant g
  join tenant t on t.id = g.tenant_id
  where g.code_hash = p_code_hash
    and t.status = 'active';
$$;

create or replace function app.cloud_tenant_for_oauth_token(p_token_key text)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select o.tenant_id
  from oauth_token o
  join tenant t on t.id = o.tenant_id
  where o.token_key = p_token_key
    and t.status = 'active';
$$;

alter function app.cloud_tenant_for_identity(uuid) owner to gw_ops;
alter function app.cloud_tenant_for_share_token(text) owner to gw_ops;
alter function app.cloud_tenant_for_authorization_code(text) owner to gw_ops;
alter function app.cloud_tenant_for_oauth_token(text) owner to gw_ops;

revoke all on function app.cloud_tenant_for_identity(uuid) from public;
revoke all on function app.cloud_tenant_for_share_token(text) from public;
revoke all on function app.cloud_tenant_for_authorization_code(text) from public;
revoke all on function app.cloud_tenant_for_oauth_token(text) from public;

grant execute on function app.cloud_tenant_for_identity(uuid) to gw_app;
grant execute on function app.cloud_tenant_for_share_token(text) to gw_app;
grant execute on function app.cloud_tenant_for_authorization_code(text) to gw_app;
grant execute on function app.cloud_tenant_for_oauth_token(text) to gw_app;
