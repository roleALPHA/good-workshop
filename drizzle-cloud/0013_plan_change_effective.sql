-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. When a chosen plan starts to apply.
--
-- `next_plan` alone said WHAT was chosen, never FROM WHEN. The billing run
-- applied it at the end of every month close -- and it closes a month on every
-- run, ten minutes apart. A plan chosen on the 15th was therefore live within
-- minutes, backdated to the first, and the month that was already running got
-- billed under a model the customer had picked halfway through it.
--
-- The date makes the promise checkable instead of implied: `cloud_change_plan`
-- writes the first of the coming month, and the run applies the change only
-- once it has arrived.
-- ═══════════════════════════════════════════════════════════════════════════

alter table billing_account
  add column next_plan_from date
    check (date_trunc('month', next_plan_from) = next_plan_from);

-- Anything chosen before this migration takes effect on the first of the coming
-- month, counted from now -- which is what it was meant to do all along.
update billing_account
   set next_plan_from = (date_trunc('month', now() at time zone 'Europe/Vienna') + interval '1 month')::date
 where next_plan is not null and next_plan_from is null;

-- The two belong together: a chosen plan without a date could be applied at any
-- time, a date without a plan applies nothing.
alter table billing_account
  add constraint billing_account_next_plan_dated
    check ((next_plan is null) = (next_plan_from is null));
