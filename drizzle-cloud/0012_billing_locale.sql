-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. The language a billing account is written to.
--
-- Everything the billing run sends -- the invoice, the reminder before a trial
-- ends, the notice after a failed collection -- used to be German, with a
-- comment saying "until billing accounts remember a language". This is that
-- memory.
--
-- The language is the one the customer registered in: it is already carried
-- through the signup and written to `identity.locale`, but the worker runs as
-- the operations role and has no business reading an identity. Billing data
-- belongs on the billing account.
--
-- The accounting system is given German or English, nothing else: those are
-- the two an invoice is rendered in. Mails use the stored language directly,
-- because they exist in all four.
-- ═══════════════════════════════════════════════════════════════════════════

alter table billing_account
  add column locale text not null default 'de'
    constraint billing_account_locale check (locale in ('de', 'en', 'es', 'fr'));

-- Accounts that predate the column keep German, which is what they were sent.
comment on column billing_account.locale is
  'The language the customer registered in. Invoices are German for de, English otherwise.';
