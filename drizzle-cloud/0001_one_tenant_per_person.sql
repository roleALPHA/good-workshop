-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Applied by scripts/migrate.mjs when the image was built as the
-- cloud edition (dist/edition.json), never on a self-hosted installation.
--
-- One person, one workspace. The community schema lets an identity belong to
-- several tenants -- a consultant with three client workspaces -- and a
-- self-hosted installation keeps that. The cloud answers "which workspace does
-- this sign-in open" from the identity alone, which only has one answer if the
-- database refuses a second membership. The application checks it too; this is
-- what makes the check true under a race.
-- ═══════════════════════════════════════════════════════════════════════════

create unique index member_one_tenant_per_identity on member (identity_id);

-- Where OAuth clients register themselves (RFC 7591). Registration happens
-- before anybody has signed in, so it cannot know a person's tenant; the
-- client lands here and is copied into the tenant of whoever consents to it.
-- No members, no workshops: nothing can sign into it.
select set_config('app.tenant_id', '00000000-0000-0000-0000-00000000c10d', true);
insert into tenant (id, slug, name)
values ('00000000-0000-0000-0000-00000000c10d', 'oauth-client-registry', 'OAuth client registry')
on conflict (id) do nothing;
