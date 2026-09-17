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
    -- A paused workspace and one waiting to be deleted read like a read-only one.
    (select l.state not in ('read_only', 'paused', 'deleting')
       from tenant_lifecycle l where l.tenant_id = app.current_tenant()),
    true
  );
$$;

alter function app.cloud_tenant_writable() owner to gw_ops;
revoke all on function app.cloud_tenant_writable() from public;
grant execute on function app.cloud_tenant_writable() to gw_app;

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
