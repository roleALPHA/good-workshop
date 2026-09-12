-- ═══════════════════════════════════════════════════════════════════════════
-- The sibling of app.resolve_pat, for OAuth access tokens.
--
-- Same bootstrap problem, same narrow answer: reading the token's row needs the
-- tenant, and the tenant comes from that row. A second function rather than a
-- widened first one, because the two have different columns to check -- a PAT
-- has no audience and an OAuth token does, and folding both into one signature
-- would mean a null that means "skip a security check".
--
-- It returns `resource` rather than comparing it here. The audience is a
-- property of the DEPLOYMENT (GW_APP_URL), not of the database, and a function
-- that hardcoded it would be wrong the first time somebody moved the host.
--
-- Runs after the tables exist; keep it last in the migration order.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.resolve_oauth_token(p_token_key text, p_secret_hash text)
returns table (tenant_id uuid, member_id uuid, scopes text[], resource text, member_role text)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select t.tenant_id, t.member_id, t.scopes, t.resource, m.role
  from oauth_token t
  join member m on m.tenant_id = t.tenant_id and m.id = t.member_id
  join tenant tn on tn.id = t.tenant_id
  where t.token_key = p_token_key
    and t.secret_hash = p_secret_hash
    -- Access only. A refresh token is refused by its prefix before it gets
    -- here, and this is the second lock on the same door.
    and t.kind = 'access'
    and t.revoked_at is null
    and t.expires_at > now()
    and m.status = 'active'
    and tn.status = 'active';
$$;

alter function app.resolve_oauth_token(text, text) owner to gw_ops;

revoke all on function app.resolve_oauth_token(text, text) from public;
grant execute on function app.resolve_oauth_token(text, text) to gw_app;
