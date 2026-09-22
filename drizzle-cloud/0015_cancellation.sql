-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. Ending the contract to the end of a calendar month.
--
-- AGB § 6.2 lets either side end the contract to the end of any calendar month.
-- The product had no such thing: the only way out was "delete workspace", which
-- took write access away on the spot and threw the contents in after it. So
-- whoever wanted to leave at the end of the month had to either stop working
-- three weeks early or remember to come back on the 31st.
--
-- Two dates and nothing else. The state stays what it is until the contract
-- runs out -- a notice period one keeps working through is the whole point --
-- and what happens afterwards is the deletion that already exists: read-only,
-- exportable, gone after the grace period, with the last month invoiced like
-- any other.
-- ═══════════════════════════════════════════════════════════════════════════

alter table tenant_lifecycle
  add column cancellation_requested_at timestamptz,
  -- The last day the contract runs. Always a month's last day, so that "to the
  -- end of the calendar month" is in the shape of the column and not only in
  -- the function that fills it.
  add column contract_ends_on date
    check (contract_ends_on = (date_trunc('month', contract_ends_on) + interval '1 month' - interval '1 day')::date),
  add constraint tenant_lifecycle_cancellation_dated
    check ((cancellation_requested_at is null) = (contract_ends_on is null));
