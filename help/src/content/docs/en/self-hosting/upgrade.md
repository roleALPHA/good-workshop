---
title: Upgrading and backups
description: Bring a self-hosted installation to a new version, understand migrations and back up the database.
sidebar:
  order: 4
---

In GoodWorkshop, an update is the same process as the installation: every start runs the same chain
of checks and migrations. A backup always comes first. The details are in the README under
[Updating](https://github.com/roleALPHA/good-workshop/blob/main/README.md#updating) and
[Backing up](https://github.com/roleALPHA/good-workshop/blob/main/README.md#backing-up), and in
[docs/installation-and-upgrade.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/installation-and-upgrade.md).

## Update to a new version

Which versions exist is listed on the
[releases page](https://github.com/roleALPHA/good-workshop/releases). From the directory with the
`compose.yaml`:

```bash
# 1. Back up. An upgrade without a backup is a bet.
scripts/backup.sh before-upgrade-$(date +%F).sql.gz

# 2. Fetch the new image. With GW_VERSION=latest that is all;
#    with a pinned version, point GW_VERSION in the .env at the new tag first.
docker compose pull

# 3. Bring it up.
docker compose --profile tls up -d
```

With a pinned version, enter the new number in `GW_VERSION` before step 2 — without the “v”.
Without the `tls` profile, leave out `--profile tls`.

## What happens to the database at startup

`migrate` runs at every start, and `app` waits for it. That way, a container that would run against
a schema it doesn't understand never even comes up.

| Step               | What it does                                                   |
| ------------------ | -------------------------------------------------------------- |
| `db-bootstrap.mjs` | creates roles and sets their passwords                         |
| `preflight.mjs`    | **only reads** and checks whether the data fits the migrations |
| `migrate.mjs`      | applies pending migrations                                     |
| `provision.mjs`    | sets up block types                                            |

### When the preflight check stops

If the preflight check finds rows that stand in the way of a migration, `migrate` aborts with
“MIGRATION STOPPED”. The database is then **unchanged** — there's nothing to roll back. The message
names the affected rows, the query you can use to look at them, and the decision that has to be
made. Then you start again with the same command.

You can see what an update would find without updating:

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

:::caution[When a migration fails halfway]
Then the state in `drizzle.__drizzle_migrations` is authoritative: it says what was applied. The
way back leads from there through the backup. `docker compose logs migrate` gives the reason.
:::

### Automatic updates (Watchtower)

An updater like Watchtower replaces **only** the container it watches. The `migrate` service never
runs in that case, and the new app would run against the old schema. For that there is
`GW_MIGRATE_ON_START=1` together with a `compose.override.yaml` from the README
([Automatic updates](https://github.com/roleALPHA/good-workshop/blob/main/README.md#automatic-updates)).
The price: `app` then also holds the passwords of the superuser and of `gw_owner`, and the role
separation is lifted for this container. Make that decision consciously.

## Back up

The database is the complete data, logos included — they're rows, not files. A dump is enough:

```bash
scripts/backup.sh goodworkshop-$(date +%F).sql.gz
```

Use the script rather than a hand-written `pg_dump` line. That line creates a file even when
nothing was backed up. The script writes next to it first, checks whether the dump ran all the way
to its final line, and only then gives it its final name.

### The application key belongs with it

The application key decrypts the mail credentials entered in the interface. It isn't in the dump:

```bash
docker compose exec -T app cat /run/db-secrets/app/secret-key > goodworkshop-key.txt
```

If it's lost, the backup comes back with **empty** mail credentials. Everything else — workshops,
members, branding — survives that; you enter the credentials once more.

### What belongs in the nightly backup

Exactly three things: the dump, the application key and the `.env`. Not the database passwords —
the stack generates new ones when needed. Check what's in the archive, not just that it's there. A
failed dump can leave behind a valid but empty gzip archive:

```bash
gzip -dc goodworkshop.sql.gz | tail -c 400 | grep -c 'dump complete'
```

For off-site backups, there are three scripts in the repo, meant as systemd timers:

| Script                        | What it answers                                   | Where it runs                     |
| ----------------------------- | ------------------------------------------------- | --------------------------------- |
| `scripts/backup-offsite.sh`   | Is today's state stored encrypted somewhere else? | on the server, daily              |
| `scripts/backup-verify.sh`    | Does the backup actually come back?               | on the server, weekly             |
| `scripts/backup-freshness.sh` | Are backups still being made at all?              | **on a different machine**, daily |

Configuration and systemd units are in the README.

## Restore

The database passwords aren't in the dump, and a restore on a new server doesn't need them either:
`secrets` generates new ones, and `migrate` sets them on the roles. The roles themselves aren't in
any dump; `db-bootstrap.mjs` creates them. So to restore, you need the dump, the application key
and the `.env`.

The repo doesn't document a ready-made restore command for the running installation. How a dump is
read back into a fresh Postgres is shown by `scripts/backup-verify.sh`: it does exactly that in
throwaway containers, without touching the production stack. Try out the restore before you need
it.

:::note[Retention is a promise]
The off-site backup keeps 14 daily, 8 weekly and 12 monthly states. Whatever you configure also
belongs in your privacy policy, see [Data protection](/en/self-hosting/data-protection/).
:::

## Read on

- [Installation](/en/self-hosting/installation/)
- [Configuration](/en/self-hosting/configuration/)
- [Known issues](/en/troubleshooting/known-issues/)
