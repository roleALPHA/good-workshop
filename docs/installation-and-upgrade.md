# Installation and upgrade

An installation that only succeeds the first time is not one. The routine here is built so that
**every start walks the same chain** — fresh or for the hundredth time.

## The chain

`migrate` runs on every `up`; `app` depends on it through `service_completed_successfully` and
does not start at all if it fails.

| Step               | Role                             | Writes?                                              |
| ------------------ | -------------------------------- | ---------------------------------------------------- |
| `db-secrets.mjs`   | — (its own service, before `db`) | one password per role, only when missing             |
| `db-bootstrap.mjs` | `postgres` (superuser)           | roles, schema ownership, role passwords. Idempotent. |
| `preflight.mjs`    | `postgres` (superuser)           | **no — reads only**                                  |
| `migrate.mjs`      | `gw_owner`                       | the schema, under an advisory lock                   |
| `provision.mjs`    | `gw_app`, with tenant context    | block types, bootstrap admin. Idempotent.            |

The separation of roles is the point: creating roles is an operator action and not a migration;
the application runs with the unprivileged role that RLS, NOINHERIT and the `revoke` on the
identity tables were built for.

## How the containers authenticate

Every login role has its own random password in a file. `db-secrets.mjs` creates missing ones at
start; **every role has its own volume**, and a service mounts only the ones it needs:

| Service   | receives                         |
| --------- | -------------------------------- |
| `db`      | `postgres`                       |
| `migrate` | `postgres`, `gw_owner`, `gw_app` |
| `app`     | **only** `gw_app`                |

**Do not soften this separation.** A shared directory for every secret puts the superuser
password into exactly the container an attacker reaches first — and with that, everything RLS
and NOINHERIT were built for is void. It can be checked:

```bash
docker compose exec app ls /run/db-secrets
# gw_app -- and nothing else
```

How it got here belongs to the reasoning: before this there was peer authentication over a
shared socket, with the nicer promise of "no password, anywhere". It could not work — peer
compares the OS user of the connecting process with the role name, and the app container runs
as `node` (uid 1000) while the database container knows uid 70 as `postgres` and nobody at 1000. On top of that the Postgres entrypoint does not initialise at all without a password or
`trust`. The stack did not start on a fresh installation.

The password is set **from the file into the connection URL**, not into an environment
variable — `docker inspect` prints a container's environment. Two places do it:
`scripts/db-connect.mjs` for the scripts and `withPasswordFile` in `src/server/db/client.ts`
for the application. Two copies, because `allowJs: false` applies and the scripts run unbuilt —
whoever changes one changes the other.

## The preflight

A generated migration can add a constraint but cannot say what has to hold for the existing rows
for that to succeed. If it does not hold, Postgres aborts **mid-run** with a bare error code.
[`scripts/preflight.mjs`](../scripts/preflight.mjs) asks those questions beforehand.

### Recording a new data precondition

If a migration adds a constraint that existing rows can violate — a composite FK, a `not null`
without a default, a new `unique` index — an entry belongs in `CHECKS`:

```js
{
  id: '<what is wrong, in one sentence>',
  migration: '<filename of the migration>',
  relevant: (c) => /* false as soon as the constraint already exists */,
  find: `select ... limit ${SAMPLE_LIMIT}`,
  explain: ['How the rows could come about and which decision is due.'],
  inspect: `-- the query a human runs by hand`,
}
```

Three rules that come from mistakes:

1. **`relevant` asks about the constraint, not about the name.** Drizzle's generated constraint
   names are longer than 63 characters and are silently truncated by Postgres — the name in
   `pg_constraint` is not the name in the migration file. `missingCompositeDayFk` therefore asks
   about the columns.
2. **The check does not guess.** It names the rows and the decision. Where a stray block belongs
   is a question about content; a script that answers it will eventually write the wrong thing
   into a customer's record.
3. **After the entry: test against an affected database.** A check that only ran against the
   clean database has proved that it finds nothing — no more than that.

### Why the preflight runs as superuser

Every policy here applies `to gw_app`, and every table is under FORCE ROW LEVEL SECURITY — which
catches the owner too. Read through `gw_owner`, **every table is empty**. A preflight over that
connection would give a broken database a green light.

Hence `ADMIN_DATABASE_URL`, and `assertSeesEveryRow()` refuses the connection if it does turn
out to be subject to RLS. **Do not remove that guard.** It is the difference between a check and
a guarantee that never checked anything.

The bypass is defensible here because it **only reads**. Provisioning deliberately does it
differently: it sets the tenant context and writes through the same door as the application. A
provisioning path with a bypass role is one that quietly writes into the wrong tenant.

## Upgrade

```bash
scripts/backup.sh before-upgrade-$(date +%F).sql.gz
# point GW_VERSION in the .env at the new tag; provide the image
docker compose --profile tls up -d
```

To check what an upgrade would find, without upgrading:

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

The passwords live in their own volumes and are **not** in the dump. A restore onto a new server
does not need them either: `db-secrets.mjs` generates new ones and `db-bootstrap.mjs` sets them
on the roles on every run.

**If the preflight stops, the database is unchanged.** There is nothing to roll back: fix the
rows, issue the same command again.

If `migrate` fails instead, the state in `drizzle.__drizzle_migrations` is authoritative — it
says what was applied. From there the way back is the dump.

## What breaks easily when changing things

- **`${VAR:?}` in `compose.yaml` outside an active profile.** Compose interpolates the **whole**
  file on load, including services whose profile is not active. A required field on the `caddy`
  service therefore breaks every `up` without `tls` — and running without HTTPS is explicitly
  supported. Checks like that belong in the container's `command:`.
- **Adding a variable and forgetting to pass it through.** `GW_OPS_TOKEN` and `GW_COLLAB_URL`
  had exactly that, and `GW_TIMEZONE` nearly repeated it. `pnpm check:docs` catches it now — see
  [keeping the docs honest](keeping-docs-honest.md).
- **Making something in `provision.mjs` non-idempotent.** It runs on every boot. Which is why
  the CI job `Schema & Tenant Isolation` calls it twice in a row.
- **Opening the database to the outside.** `db` deliberately publishes no port. The promise that
  only this compose network can reach it hangs on that — with a port mapping the database is on
  the host's network with nothing but the password in between.
- **Printing a sign-in link on every start.** `bootstrapAdmin` only prints when the member was
  newly created — otherwise every restart would leave a valid credential in the log.

## After every change to the routine

```bash
pnpm check:docs
pnpm db:bootstrap && pnpm db:preflight && pnpm db:migrate && pnpm db:provision && pnpm db:provision
pnpm test:db
```

All four connections have to point at the **same** database. `vitest.db.config.ts` falls back to
`goodworkshop` for `OPS_DATABASE_URL`: redirect only `DATABASE_URL` and the tests write into one
database and read from the other, producing dozens of failures that look like a permissions
breach and are not.

```bash
export ADMIN_DATABASE_URL=postgres://postgres@127.0.0.1:5433/<db>
export MIGRATION_DATABASE_URL=postgres://gw_owner@127.0.0.1:5433/<db>
export DATABASE_URL=postgres://gw_app@127.0.0.1:5433/<db>
export OPS_DATABASE_URL=postgres://gw_ops@127.0.0.1:5433/<db>
```

Run the chain twice against a **fresh** database, because the most common regression is the one
that only appears on the second start: the PAT resolver that no longer belonged to `gw_owner`
made every installation fail on the second `up` — the first one ran.
