-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. That the person registering may sign for the company.
--
-- AGB § 1.3 has the person who registers assure us they are entitled to
-- represent the customer. The product never asked. The business confirmation
-- next to it was collected and dated from the first day; this one was a
-- sentence in a document nobody had agreed to yet.
--
-- A timestamp rather than a boolean, like the other two: what matters later is
-- not that a box was ticked but when, and against which wording.
-- ═══════════════════════════════════════════════════════════════════════════

alter table billing_account
  add column authority_confirmed_at timestamptz;
