-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. The operator console: who may use it, how they sign in, and
-- what they did.
--
-- Operators are not identities. Nobody signs into the console with a customer
-- account, and a stolen customer session opens nothing here. Sign-in is by
-- passkey only; the first passkey is enrolled through a one-time link that
-- scripts/operator.mjs prints on the server.
--
-- The console runs as gw_operator, a role that can read and write these tables
-- and call the app.op_* functions -- and nothing else. It has no grant on any
-- tenant table, so it cannot read a workshop even by mistake.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gw_operator') then
    create role gw_operator login noinherit nobypassrls;
  end if;
end
$$;

grant usage on schema public, app to gw_operator;

create table operator (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table operator_credential (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operator (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  sign_count bigint not null default 0,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table operator_challenge (
  id uuid primary key default gen_random_uuid(),
  challenge text not null unique,
  operator_id uuid references operator (id) on delete cascade,
  purpose text not null check (purpose in ('registration', 'authentication')),
  expires_at timestamptz not null
);

create table operator_enrollment (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operator (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table operator_session (
  id uuid primary key,
  operator_id uuid not null references operator (id) on delete cascade,
  secret_hash text not null,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- Append-only: an operator can add to this and read it, never change it.
create table operator_audit (
  id bigint generated always as identity primary key,
  operator_id uuid not null references operator (id),
  action text not null,
  tenant_id uuid,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index operator_audit_tenant_idx on operator_audit (tenant_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['operator', 'operator_credential', 'operator_challenge',
                           'operator_enrollment', 'operator_session', 'operator_audit'] loop
    execute format('alter table %I owner to gw_owner', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end
$$;

-- Everything for the console's role; nothing for the application's, whose
-- blanket table grants meet forced row level security with no policy at all.
create policy operator_console on operator for all to gw_operator using (true) with check (true);
create policy operator_console on operator_credential for all to gw_operator using (true) with check (true);
create policy operator_console on operator_challenge for all to gw_operator using (true) with check (true);
create policy operator_console on operator_enrollment for all to gw_operator using (true) with check (true);
create policy operator_console on operator_session for all to gw_operator using (true) with check (true);
create policy operator_audit_read on operator_audit for select to gw_operator using (true);
create policy operator_audit_append on operator_audit for insert to gw_operator with check (true);

grant select, insert, update, delete on operator, operator_credential, operator_challenge,
  operator_enrollment, operator_session to gw_operator;
grant select, insert on operator_audit to gw_operator;
