-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. What a tenant admin and an operator can do to a workspace.
--
--   paused    -- an operator's decision: everybody reads, nobody writes, billing
--                continues as normal
--   deleting  -- a tenant admin (or an operator) asked for the workspace to be
--                deleted: read-only so that it can still be exported, and gone
--                for good once delete_after has passed
--
-- Blocking is not a state here: tenant.status = 'suspended' already signs
-- everybody out, and every sign-in path checks it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table tenant_lifecycle drop constraint tenant_lifecycle_state_check;
alter table tenant_lifecycle
  add constraint tenant_lifecycle_state_check
    check (state in ('trial', 'active', 'read_only', 'paused', 'deleting')),
  -- What to go back to when a deletion or a pause is lifted.
  add column state_before text check (state_before in ('trial', 'active', 'read_only')),
  add column deletion_requested_at timestamptz,
  add column delete_after timestamptz,
  add check ((state = 'deleting') = (delete_after is not null));

-- A plan change takes effect on the first of the next month, so that a month is
-- billed under one plan.
alter table billing_account
  add column next_plan text check (next_plan in ('per_user', 'per_workshop'));
