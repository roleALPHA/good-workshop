# GoodWorkshop

Open-source workshop planning. Self-hosted, MCP-ready.

Build agendas out of blocks, clusters and workshop days, reorder them by drag and drop,
export them as Markdown — and the data stays on your own machine.

> **Status: in development.** Milestone 1 (the editor core) is being built. No release yet.

## What GoodWorkshop does

**Builds agendas.** A workshop is made of days, a day of blocks — exercises, inputs, breaks —
which can be grouped into clusters. Reordering happens by drag and drop; the times follow. It
comes with 15 built-in block types, and you can add your own.

**Lets two people work on the same day.** Several people can edit the same workshop day at
once. Whoever is there is listed in the presence bar; changes appear immediately for
everybody and merge rather than overwrite each other.

**Speaks four languages.** German, English, French and Spanish — the interface, the error
messages, the e-mails, the Markdown export and the built-in block types. Everybody picks
their own under **Settings**; a workshop shared between a German and a French facilitator
shows each of them their own language, and the text they wrote themselves stays exactly as
they wrote it.

**Finds things again.** Workshops live in folders and carry tags, both optional. The folder,
the tag and the search are in the URL — so a filtered library is a link you can pass on and
come back to. Tags appear as you type; a tag nothing points at any more disappears by itself.

**Works for a team.** An admin invites people by e-mail address under **Members**. Access to
a single workshop is granted by its owner under **Access**: edit or read, per member.

**Shares with people who have no account.** Under **Access** you can also invite an e-mail
address directly — read, or read and write. The invitation is a link that only works with that
address: whoever opens it types the address it was sent to, and then sees the days of that one
agenda. No account, no library, no folders, and nothing else from the installation. The link is
valid until the last day of the agenda, and can be withdrawn at any time.

**Looks like you.** Under **Branding** you can set a logo and an accent colour; the server
derives the light and dark steps itself. The footer stays `GoodWorkshop · powered by
roleALPHA`.

**Connects to an AI client.** GoodWorkshop is an MCP server: Claude Desktop, Claude Code or
any other MCP client can read and write workshops. You create a token under **Tokens** in
your settings; in the client you enter it as `Authorization: Bearer gwp_…` against
`https://<host>/api/mcp`. A token acts as the person who created it — it can never do more
than that person can, and it cannot touch user administration at all.

How this is built on the inside, and why, is in [docs/architecture.md](docs/architecture.md).

## Contributing

```bash
pnpm install
pnpm db:up      # Postgres and a mail catcher for development
pnpm dev
```

| Command              | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `pnpm lint`          | ESLint including the project guardrails                                  |
| `pnpm typecheck`     | `tsc --noEmit`                                                           |
| `pnpm test`          | Vitest (unit + component)                                                |
| `pnpm test:coverage` | with coverage thresholds on `src/domain`, `src/features`, `src/i18n`     |
| `pnpm test:db`       | tenant isolation and auth against a real database                        |
| `pnpm test:e2e`      | Playwright (desktop + Pixel 5) against the built standalone server       |
| `pnpm format`        | Prettier                                                                 |
| `pnpm build`         | production build (`output: 'standalone'`)                                |
| `pnpm check:docs`    | checks that README, `.env.example` and `compose.yaml` still fit the code |

Three binding conventions, for every contribution:

- [UI and UX](docs/ui-conventions.md) — mobile-first, editing in place rather than in
  dialogs, colour tokens, branding, accessibility
- [Tests](docs/testing-conventions.md) — the test pyramid, tenant-isolation tests, flake policy
- [CI/CD](docs/ci-conventions.md) — GitHub Actions, Docker build, release to `ghcr.io`

Three guardrails are enforced by ESLint and are not a matter of style:

- **No raw hex colours** in `src/components`, `src/features`, `src/app`. Category colours go
  through the `.cat-*` OKLCH tokens, accents through `--brand-*`.
- **No German prose** in those same directories. Every string a person reads lives in
  `src/messages`; see [Languages](docs/languages.md).
- **No import of the raw `db` handle** outside `src/server/db`. Every query runs through
  `withTenant()` so that `app.tenant_id` is set — tenant isolation depends on it.

If you work on the installation, the migrations or the documentation, the details are here:

- [Keeping the docs honest](docs/keeping-docs-honest.md) — what `pnpm check:docs` checks, what
  it cannot, and what to update after which change
- [Installation and upgrade](docs/installation-and-upgrade.md) — the startup chain, the
  preflight, the database roles and what breaks easily when changing them
- [Languages](docs/languages.md) — how the catalogs are cut, where the language comes from,
  and what deliberately stays untranslated

## Installation (on-premise)

### Requirements

- Docker with Compose v2 (`docker compose version`), amd64 or arm64
- A hostname that resolves publicly to this server, and ports 80 and 443 free — Let's Encrypt
  needs both to issue the certificate
- No Postgres needed: the database runs inside the stack and is not reachable from outside
- No passwords to hand out: the stack generates the database secrets itself on first start

### 1. Get the files

You need `compose.yaml`, `Caddyfile` and a `.env`:

```bash
git clone https://github.com/roleALPHA/good-workshop.git
cd good-workshop
cp .env.example .env
```

### 2. Provide the image

**There is no published release yet.** Until the first `v*` tag exists, the image is built
locally and gets the tag `compose.yaml` expects:

```bash
docker build -t ghcr.io/rolealpha/good-workshop:local .
```

Then set `GW_VERSION=local` in the `.env`. Once there are releases, this step goes away.

### 3. Fill in the `.env`

Four values are required; without them the stack does not start and says which one is
missing:

```bash
GW_APP_URL=https://workshop.example.com   # the address the app is reachable at
GW_HOSTNAME=workshop.example.com          # the name in the certificate (profile `tls`)
GW_MAIL_TRANSPORT=smtp                    # smtp | graph | console | none
GW_VERSION=local                          # or the release tag
```

With `GW_MAIL_TRANSPORT=smtp` you also need `SMTP_URL` and `SMTP_FROM`. If the `SMTP_URL`
contains a password, it belongs in a file instead: `SMTP_URL_FILE=/run/secrets/smtp_url`. An
environment variable shows up in `docker inspect`, in `/proc/<pid>/environ` and in every core
dump.

**Microsoft 365 without SMTP:** many tenants have SMTP AUTH switched off — there
`GW_MAIL_TRANSPORT=graph` is not the more convenient way but the only one. You need an app
registration in Entra ID with the **application permission** `Mail.Send` (not the delegated
one) plus admin consent, and the mailbox to send from:

```bash
GW_MAIL_TRANSPORT=graph
GW_GRAPH_TENANT_ID=contoso.onmicrosoft.com   # or the directory id
GW_GRAPH_CLIENT_ID=00000000-0000-0000-0000-000000000000
GW_GRAPH_CLIENT_SECRET_FILE=/run/secrets/graph_secret
GW_GRAPH_SENDER=workshop@contoso.com
```

If one of these is missing, the application says so at startup — not when somebody first
fails to sign in. With `Mail.Send` alone Graph can do nothing but send: the permission does
not allow reading mailboxes.

**Decide the hostname now** — changing it later invalidates every registered passkey. See
[Things that trip people up](#things-that-trip-people-up).

### 4. Start

```bash
docker compose --profile tls up -d
```

In order: `secrets` generates the database passwords, `db` starts, `migrate` creates the
roles, checks the existing data, walks through the migrations and provisions the block types.
`app` starts only once `migrate` has come through cleanly, then `caddy` takes 80 and 443 and
fetches the certificate.

Once it runs, the healthcheck answers:

```bash
curl -fsS https://workshop.example.com/api/health
# {"status":"ok","checks":[{"name":"database","ok":true},{"name":"migrations","ok":true}]}
```

A `503` is not a crash but the honest answer "this container cannot serve" — `checks` says
whether it is the database or the migration state.

### 5. Create the first admin

Without an admin there is no way into the interface. Two routes:

**Through the CLI** — always works, even without mail delivery:

```bash
docker compose exec app node scripts/cli.mjs admin create --email you@example.com
```

The command prints a one-time sign-in link. Everything else then happens in the interface.

**Or automatically on the very first start:** put `GW_BOOTSTRAP_ADMIN_EMAIL=you@example.com`
into the `.env` before the stack comes up for the first time. The link is then in
`docker compose logs migrate`, is valid for an hour and is printed exactly once — later
starts do nothing, even if the variable stays.

### Updating

```bash
# 1. Back up. An upgrade without a backup is a bet.
scripts/backup.sh before-upgrade-$(date +%F).sql.gz

# 2. Provide the new image and point GW_VERSION in the .env at it.
#    While there is no release, that means building rather than pulling.
git pull
docker build -t ghcr.io/rolealpha/good-workshop:local .

# 3. Bring it up.
docker compose --profile tls up -d
```

Once there are releases, `docker compose pull` takes the place of the build in step 2.

`migrate` runs on every start and `app` waits for it — a container that would serve against a
schema it does not understand never comes up in the first place.

**A read-only preflight runs before the migrations.** It establishes whether the existing data
meets the conditions a pending migration imposes. If it stops, the database is **unchanged** —
there is nothing to roll back. The message names the affected rows, the query to look at them
and the decision to be made.

To see what an upgrade would find, without upgrading:

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

> **Specifically when upgrading to this version.** One migration requires that a block and a
> cluster belong to the workshop whose day they sit on. Existing installations may have rows
> where that is not true. The preflight finds them and names them one by one; where they
> belong is a question about content, which no script should guess.

### Backing up

The database is the complete record, logos included — they are rows, not files. So a `pg_dump`
is enough:

```bash
scripts/backup.sh goodworkshop-$(date +%F).sql.gz
```

The script rather than the line by hand, because the line by hand creates a file even when
nothing was backed up: `pg_dump` writes its error to stderr and leaves stdout empty, and the
redirection created the target file long before that. What is left is an empty archive with
the right name and today's date. The script writes next to it first, checks that the dump ran
all the way to its closing line, and only then gives it its final name — yesterday's backup
stays untouched until it does.

The database passwords live in their own Docker volumes (`secret_*`) and are **not** in the
dump. A restore onto a new server does not need them either: `secrets` generates new ones and
`migrate` sets them on the roles.

**One exception: the application key.** It decrypts the mail credentials entered in the
interface, and it is the only thing that can read values already in the database. So it
belongs in the backup:

```bash
docker compose exec -T app cat /run/db-secrets/app/secret-key > goodworkshop-key.txt
```

If it is lost, the dump comes back with **empty** mail credentials. Everything else survives —
workshops, members, branding — and the credentials get entered once more.

**Backing up nightly.** Three things belong in the archive, and only those three: the dump,
the application key and the `.env`. Not the database passwords — the stack generates those
afresh on every start.

```bash
cd /path/to/the/stack
./scripts/backup.sh "$TARGET/goodworkshop.sql.gz"
cp "$(docker volume inspect goodworkshop_secret_app --format '{{.Mountpoint}}')/secret-key" "$TARGET/"
cp .env "$TARGET/"
```

The key comes from the volume here rather than through `docker compose exec`: a backup that
only succeeds while the application is running is missing on exactly the night something was
broken. The volume name carries the project name in front — that is the stack's directory
name, unless `COMPOSE_PROJECT_NAME` says otherwise; `docker volume ls` shows it.

If you are extending an existing backup run with GoodWorkshop: with `set -e` the whole run
stops when the dump fails — for the other services in it too. That is the right choice. A run
that quietly skips one service and still reports "done" is the road to an archive you trust
without it holding.

**Check what is in the archive, not whether it exists.** A failed dump produces a valid gzip
archive of 20 bytes — present, readable, empty. Looking for `pg_dump`'s closing line costs one
line and actually answers the question:

```bash
gzip -dc goodworkshop.sql.gz | tail -c 400 | grep -c 'dump complete'
```

### Running without HTTPS

Possible, with three consequences: **no passkeys**, the session cookie carries no `Secure` and
travels in the clear, and sign-in links do the same.

`app` deliberately binds to `127.0.0.1` only — without a proxy nothing is reachable from
outside, not even with a misconfigured firewall. So access without the `tls` profile needs
either a reverse proxy of your own on the host or an SSH tunnel:

```bash
docker compose up -d
ssh -L 3000:127.0.0.1:3000 server
```

`GW_APP_URL` then has to point at the address the browser actually uses.

### Configuration

| Variable                                                 | Required     | Meaning                                                                                                                                      |
| -------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GW_APP_URL`                                             | yes          | Address the app is reachable at. Sign-in links and the WebAuthn origin are derived from it.                                                  |
| `GW_HOSTNAME`                                            | for `tls`    | Name in the certificate. Passed through to Caddy.                                                                                            |
| `GW_MAIL_TRANSPORT`                                      | yes          | `smtp`, `graph`, `console` or `none`.                                                                                                        |
| `GW_GRAPH_TENANT_ID`                                     | with `graph` | Microsoft 365 tenant, as a domain or a directory id.                                                                                         |
| `GW_GRAPH_CLIENT_ID`                                     | with `graph` | Application id of the app registration.                                                                                                      |
| `GW_GRAPH_CLIENT_SECRET` / `GW_GRAPH_CLIENT_SECRET_FILE` | with `graph` | The registration's secret, directly or from a file.                                                                                          |
| `GW_GRAPH_SENDER`                                        | with `graph` | Mailbox to send from.                                                                                                                        |
| `GW_VERSION`                                             | yes          | Image tag. Deliberately without a default — a moving tag is not a deployment.                                                                |
| `SMTP_URL` / `SMTP_URL_FILE`                             | with `smtp`  | Relay URL, directly or from a file.                                                                                                          |
| `SMTP_FROM`                                              | with `smtp`  | Sender address.                                                                                                                              |
| `GW_RP_ID`                                               | no           | WebAuthn relying party id. Empty = host from `GW_APP_URL`. Changing it afterwards invalidates every passkey.                                 |
| `GW_TIMEZONE`                                            | no           | Time zone for dates in the interface (default `Europe/Berlin`). Set explicitly so server and browser format the same instant identically.    |
| `GW_BOOTSTRAP_ADMIN_EMAIL`                               | no           | Creates an admin on the very first start and prints their link.                                                                              |
| `GW_OPS_TOKEN`                                           | no           | Makes `/api/health` verbose with the header `x-ops-token` (version, migration state, driver error). Without it the public endpoint is terse. |
| `GW_SECRET_KEY` / `GW_SECRET_KEY_FILE`                   | no           | Encrypts the mail credentials entered in the interface. Leave empty: the stack generates it. **Belongs in the backup** — see "Backing up".   |
| `GW_TRUSTED_PROXIES`                                     | no           | Number of proxies in front (default 1). Only for throttling and logs, never for a permission.                                                |
| `GW_SESSION_IDLE_DAYS`                                   | no           | After how many unused days a session expires (default 14).                                                                                   |
| `GW_PORT`, `GW_COLLAB_PORT`                              | no           | Ports on `127.0.0.1`, in case the defaults are taken.                                                                                        |
| `GW_COLLAB_URL`, `GW_COLLAB_INTERNAL_URL`                | no           | Only needed if the collaboration service is not at `/collab` on the same host.                                                               |

## Things that trip people up

**1. Passkeys need HTTPS.** Except on `localhost`, WebAuthn passkeys do not work over
`http://`. Anybody hosting on `http://192.168.1.50:3000` cannot use them at all. That is why
e-mail sign-in links are a full route of their own and not a stopgap — and why the `tls`
profile is the recommended path, not an appendix.

**2. `GW_RP_ID` hangs off the hostname.** Changing the hostname after passkeys have been
registered invalidates _every_ registered passkey. Decide it beforehand.

**3. `GW_MAIL_TRANSPORT=console` is a deliberate decision.** Without HTTPS and without SMTP it
still gets you in: sign-in links are printed to stdout. But anybody who can read
`docker logs` — the docker group, a log aggregator, an excerpt sent to support — can have a
link issued for **any** address. The application says so again at startup.

### When it does not run

| Symptom                                         | Cause                                                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GW_APP_URL must be set` on `up`                | A required value is missing from the `.env`. The message names it.                                                                                                      |
| Caddy does not start, "GW_HOSTNAME must be set" | `tls` profile without a hostname.                                                                                                                                       |
| The certificate is not issued                   | The hostname does not resolve to this server, or 80/443 are taken.                                                                                                      |
| `/api/health` answers 503 with `database`       | Database unreachable or still starting.                                                                                                                                 |
| `/api/health` answers 503 with `migrations`     | `migrate` did not come through: `docker compose logs migrate`.                                                                                                          |
| `migrate` stops with "MIGRATION STOPPED"        | The preflight found rows standing in the way of a migration. The database is unchanged; the message names the rows and the decision.                                    |
| No sign-in link in the inbox                    | Check `GW_MAIL_TRANSPORT`. With `console` it is in `docker compose logs app`.                                                                                           |
| Graph answers `403` or `invalid_client`         | The app registration does not have the **application permission** `Mail.Send` with admin consent, or the secret has expired. The message is in `app`'s log.             |
| Sign-in works, no passkey offered               | No HTTPS — expected behaviour, see above.                                                                                                                               |
| The editor permanently shows "offline"          | The collaboration service is unreachable, or `GW_APP_URL` does not match the address in the browser: the socket refuses a foreign origin and writes that to the log.    |
| The interface is in the wrong language          | The language comes from your account (**Settings**), then a cookie, then the browser's `Accept-Language`. A fresh account starts in the language of whoever invited it. |

## Licence

AGPL-3.0-only.
