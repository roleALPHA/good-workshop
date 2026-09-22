-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. The second step of the dunning ladder, and the grace an operator
-- can put in its way.
--
-- AGB § 5.4 allows two steps: read-only first, and the access blocked after an
-- unsuccessful reminder. Only the first ever happened automatically. The second
-- was `tenant.status = 'suspended'`, which an operator had to set by hand --
-- and which signs everybody out at their next request. Automating THAT would
-- have locked a customer out of contents that are theirs (§ 9.1), and that we
-- are obliged to help them get at as their processor.
--
-- So the blocked state lives here instead, next to read_only and paused: it
-- refuses the same writes, signs nobody out, and leaves the export open.
-- `suspended` stays what it was -- the hard bolt for abuse, an operator's
-- decision, nothing to do with money.
--
--   payment_blocked -- the reminder went unanswered. Editor, library and
--                      collaboration are closed; the export and the billing
--                      page stay open, and a payment reopens it by itself.
-- ═══════════════════════════════════════════════════════════════════════════

alter table tenant_lifecycle drop constraint tenant_lifecycle_state_check;
alter table tenant_lifecycle
  add constraint tenant_lifecycle_state_check
    check (state in ('trial', 'active', 'read_only', 'payment_blocked', 'paused', 'deleting'));

alter table tenant_lifecycle drop constraint tenant_lifecycle_state_before_check;
alter table tenant_lifecycle
  add constraint tenant_lifecycle_state_before_check
    check (state_before in ('trial', 'active', 'read_only', 'payment_blocked'));

-- When the reminder was sent, so that the step after it has a date to wait for
-- rather than a feeling. Cleared when the debt is settled.
alter table tenant_lifecycle
  add column dunned_at timestamptz;

-- An operator's goodwill: the ladder steps over this tenant until the date
-- passes, and then carries on exactly where it stood. Not a state, because it
-- is not one -- the workspace is active again while it lasts.
alter table tenant_lifecycle
  add column grace_until timestamptz;
