-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. A read-only tenant cannot change its content -- enforced by the
-- database, not merely hidden by the interface.
--
-- The application already refuses write capabilities for such a tenant
-- (edition.tenantWritable in src/domain/agenda/access.ts), which is what makes
-- the editor show a read view instead of failing on save. These policies are
-- what holds when some other path -- an MCP tool, a server action nobody
-- thought of -- tries anyway.
--
-- RESTRICTIVE, so they narrow the tenant isolation policies instead of adding
-- a second way in. Re-applied on every migration run.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.cloud_tenant_writable()
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select coalesce(
    -- A paused workspace, a blocked one and one waiting to be deleted all read
    -- like a read-only one as far as the content is concerned.
    (select l.state not in ('read_only', 'payment_blocked', 'paused', 'deleting')
       from tenant_lifecycle l where l.tenant_id = app.current_tenant()),
    true
  );
$$;

/**
 * How much of the product a workspace still has.
 *
 * Three answers, because there are three situations and not two. `read` is a
 * workspace that may look at its work but not change it -- an expired trial, a
 * pause, a deletion under way. `export` is one that has stopped paying after a
 * reminder: the product is closed, and what is left is the way to take the
 * contents out. They are the customer's, and being in arrears does not change
 * whose they are.
 */
create or replace function app.cloud_tenant_access()
returns text
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select coalesce(
    (select case
              when l.state in ('trial', 'active') then 'full'
              when l.state = 'payment_blocked' then 'export'
              else 'read'
            end
       from tenant_lifecycle l where l.tenant_id = app.current_tenant()),
    'full'
  );
$$;

do $$
declare f text;
begin
  foreach f in array array['app.cloud_tenant_writable()', 'app.cloud_tenant_access()'] loop
    execute format('alter function %s owner to gw_ops', f);
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to gw_app', f);
  end loop;
end
$$;

-- The content of a workshop library. Tables deliberately NOT in this list, and
-- why, are named in src/server/edition/cloud-status.cloud.db.test.ts, which
-- fails when a tenant table is in neither list.
do $$
declare
  guarded text[] := array[
    'cluster', 'folder', 'folder_collaborator', 'module', 'module_revision', 'tag',
    'workshop', 'workshop_collaborator', 'workshop_day', 'workshop_share_link', 'workshop_tag'
  ];
  t text;
begin
  foreach t in array guarded loop
    execute format('drop policy if exists cloud_read_only_insert on %I', t);
    execute format('drop policy if exists cloud_read_only_update on %I', t);
    execute format('drop policy if exists cloud_read_only_delete on %I', t);
    execute format(
      'create policy cloud_read_only_insert on %I as restrictive for insert to gw_app
         with check (app.cloud_tenant_writable())', t);
    execute format(
      'create policy cloud_read_only_update on %I as restrictive for update to gw_app
         using (app.cloud_tenant_writable()) with check (app.cloud_tenant_writable())', t);
    execute format(
      'create policy cloud_read_only_delete on %I as restrictive for delete to gw_app
         using (app.cloud_tenant_writable())', t);
  end loop;
end
$$;
