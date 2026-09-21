-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. A second way into the operator console: a link by mail.
--
-- The console was passkey-only, and that is still the way in that should be
-- used. What it lacked was a way back after a lost or replaced device: a
-- passkey is bound to its origin, and an operator whose laptop is gone has no
-- second one -- somebody with a shell on the server had to issue an enrollment
-- link.
--
-- So this is a fallback, and it is built like one:
--
--   * The link lives for fifteen minutes and is spent on first use.
--   * Only the hash is stored. The token itself exists in one mail and in the
--     browser that follows it.
--   * Three unspent links per operator per hour, and asking for another does
--     not say whether the address belongs to an operator at all.
--   * Every sign-in through it is written to operator_audit, like everything
--     else in this console.
-- ═══════════════════════════════════════════════════════════════════════════

create table operator_login (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operator (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_at timestamptz not null default now()
);

create index operator_login_recent_idx on operator_login (operator_id, requested_at);

alter table operator_login owner to gw_owner;
alter table operator_login enable row level security;

grant select, insert, update on operator_login to gw_operator;
create policy operator_console on operator_login for all to gw_operator using (true) with check (true);
