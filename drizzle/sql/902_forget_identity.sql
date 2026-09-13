-- ═══════════════════════════════════════════════════════════════════════════
-- Deleting the person once the last membership is gone.
--
-- The application cannot decide this on its own, and that is by construction
-- rather than by omission: `gw_app` may read `member` but not `identity`,
-- `gw_auth` may read `identity` but not `member`, and the separation is what
-- keeps a tenant's data from being joinable to a global account table. So the
-- one question that spans both -- "does this person still belong to any
-- workspace at all?" -- has no role that can ask it.
--
-- This function is that question and its consequence, in one place, so that
-- neither can happen without the other. It runs as gw_ops, which carries
-- BYPASSRLS: the count has to see EVERY tenant, not the caller's. An admin of
-- one workspace removing somebody must not delete an account that another
-- workspace still uses, and a count scoped by RLS would say zero and be wrong.
--
-- Returns whether the identity was deleted, so the caller can say what
-- happened rather than guess. Deleting it takes sessions, login tokens and
-- passkeys with it by cascade -- which is the point: what is left afterwards
-- is no e-mail address.
--
-- Runs after the tables exist; keep it with the resolvers in the migration
-- order.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.forget_identity_if_orphaned(p_identity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  still_a_member boolean;
begin
  -- `exists` rather than a count: the answer is a yes/no and the index can
  -- stop at the first row.
  select exists (select 1 from member where identity_id = p_identity_id)
    into still_a_member;

  if still_a_member then
    return false;
  end if;

  delete from identity where id = p_identity_id;
  -- FOUND is false when the id was already gone -- a double submit, or two
  -- admins removing the last two memberships at once. Not an error: the
  -- postcondition the caller cares about holds either way.
  return found;
end;
$$;

alter function app.forget_identity_if_orphaned(uuid) owner to gw_ops;

revoke all on function app.forget_identity_if_orphaned(uuid) from public;
grant execute on function app.forget_identity_if_orphaned(uuid) to gw_app;
