-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Bringing a self-registered OAuth client into the tenant of the
-- person consenting to it.
--
-- A client registers before anybody has signed in, so it lands in the registry
-- tenant (drizzle-cloud/0001). The consent screen, the authorization code and
-- the tokens all live in the person's own tenant, so the client is copied there
-- the first time somebody in that tenant opens the consent screen for it -- with
-- the same public client_id, so the client never notices.
--
-- The target is app.current_tenant(), never a parameter: the only tenant this
-- can write into is the one the caller is already acting as. Copying grants
-- nothing -- registration is open anyway, and every permission still comes
-- from a person at the consent screen.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.cloud_adopt_oauth_client(p_client_key text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  registry constant uuid := '00000000-0000-0000-0000-00000000c10d';
  target uuid := app.current_tenant();
begin
  if target is null or target = registry then
    return;
  end if;

  insert into oauth_client (id, tenant_id, client_key, secret_hash, name, redirect_uris)
  select gen_random_uuid(), target, c.client_key, c.secret_hash, c.name, c.redirect_uris
  from oauth_client c
  where c.tenant_id = registry
    and c.client_key = p_client_key
  on conflict (tenant_id, client_key) do nothing;
end;
$$;

alter function app.cloud_adopt_oauth_client(text) owner to gw_ops;
revoke all on function app.cloud_adopt_oauth_client(text) from public;
grant execute on function app.cloud_adopt_oauth_client(text) to gw_app;
