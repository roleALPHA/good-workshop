-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. What a plan costs, and since when.
--
-- The price lives in the accounting system: it has to be on the article there
-- for the invoice anyway, and a second copy in the code is a second copy to
-- forget -- the registration page advertised one euro for a while after the
-- price had gone to five.
--
-- The billing worker reads the article price from Odoo and appends a row here
-- when it changes. The web container reads this table and needs no access to
-- the accounting system at all.
--
-- Two rules are in the shape of the table, not in the application:
--
--   * A price is valid FROM a date, and a change always takes effect on the
--     first of a month. A price raised on the 20th therefore never applies to
--     the month that is already running -- the customer was told beforehand,
--     and the invoice matches what was announced.
--   * Every price ever in force stays. Which price a month was billed at is a
--     question an invoice from two years ago can still raise.
-- ═══════════════════════════════════════════════════════════════════════════

create table plan_price (
  plan text not null,
  net_cents integer not null check (net_cents >= 0),
  -- Always the first of a month; the check says so rather than the comment.
  effective_from date not null check (date_trunc('month', effective_from) = effective_from),
  source text not null default 'accounting',
  recorded_at timestamptz not null default now(),
  primary key (plan, effective_from)
);

alter table plan_price owner to gw_owner;

-- When the accounting system was last asked, and whether it answered. A price
-- nobody has confirmed for a day is not a price we take new orders on.
create table plan_price_sync (
  id boolean primary key default true check (id),
  checked_at timestamptz,
  last_error text
);

alter table plan_price_sync owner to gw_owner;
insert into plan_price_sync (id, checked_at) values (true, null) on conflict do nothing;

-- Not tenant data: the same two prices apply to everybody. The web container
-- reads them, the worker writes them.
grant select on plan_price, plan_price_sync to gw_app;
grant select, insert, update on plan_price, plan_price_sync to gw_ops;

-- The prices as they stand, backdated far enough that no month is left without
-- one. Months already closed keep the amount stored on their period, so this
-- rewrites nothing; it only answers for months that have yet to be billed.
insert into plan_price (plan, net_cents, effective_from, source)
values ('per_user', 500, date '2020-01-01', 'migration'),
       ('per_workshop', 100, date '2020-01-01', 'migration')
on conflict do nothing;
