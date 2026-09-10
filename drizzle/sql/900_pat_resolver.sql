-- ═══════════════════════════════════════════════════════════════════════════
-- The one SECURITY DEFINER function in the codebase.
--
-- Bootstrap problem: to read a personal access token's row you need the tenant,
-- and the tenant comes from that very row. Rather than give the MCP path a
-- privileged connection, exactly one narrow, auditable function is allowed to
-- look past RLS -- and it returns nothing but the identifiers needed to set the
-- tenant context properly.
--
-- Runs after the tables exist; keep it last in the migration order.
-- ═══════════════════════════════════════════════════════════════════════════

-- Hashes are stored as hex text rather than bytea: the comparison is the same,
-- and it keeps Buffer round-trips out of every code path that touches a token.
create or replace function app.resolve_pat(p_token_id text, p_secret_hash text)
returns table (tenant_id uuid, member_id uuid, pat_id uuid, scopes text[], member_role text)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select t.tenant_id, t.member_id, t.id, t.scopes, m.role
  from personal_access_token t
  join member m on m.tenant_id = t.tenant_id and m.id = t.member_id
  join tenant tn on tn.id = t.tenant_id
  where t.token_id = p_token_id
    and t.token_hash = p_secret_hash
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now())
    and m.status = 'active'
    and tn.status = 'active';
$$;

revoke all on function app.resolve_pat(text, text) from public;
grant execute on function app.resolve_pat(text, text) to gw_app;
