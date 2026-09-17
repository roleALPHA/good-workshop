-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. GoodWorkshop Cloud is sold to businesses only.
--
-- New billing accounts can only be a business, and registration records that
-- the person confirmed ordering as one. NOT VALID, so an account created while
-- consumers were still offered keeps its row -- it is a record of what was
-- agreed then, not something a migration gets to rewrite.
-- ═══════════════════════════════════════════════════════════════════════════

alter table billing_account drop constraint billing_account_customer_type_check;
alter table billing_account
  add constraint billing_account_business_only check (customer_type = 'business') not valid;

alter table billing_account add column business_confirmed_at timestamptz;
