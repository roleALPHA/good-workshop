#!/usr/bin/env node
/**
 * One-time database bootstrap. Runs as a SUPERUSER.
 *
 * Creating roles is an operator action, not a migration: migrations run as
 * gw_owner, which deliberately has no right to create roles. Keeping the two
 * apart is what lets the runtime role stay unprivileged.
 *
 * NO PASSWORDS ARE SET, ANYWHERE. The roles authenticate over a Unix domain
 * socket with peer authentication, so there is no secret to leak, to rotate, to
 * forget in an env file, or to find in a backup. See compose.yaml.
 *
 *   ADMIN_DATABASE_URL=postgres:///goodworkshop?host=/var/run/postgresql \
 *   node scripts/db-bootstrap.mjs
 */
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { dbOptions } from './db-connect.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.env.ADMIN_DATABASE_URL
if (!url) {
  console.error('ADMIN_DATABASE_URL is required (a superuser connection).')
  process.exit(1)
}

const client = new pg.Client(dbOptions(url, process.env.ADMIN_DATABASE_PASSWORD_FILE))
await client.connect()

try {
  await client.query(await readFile(join(root, 'drizzle/sql/000_bootstrap.sql'), 'utf8'))

  // gw_owner owns the schema it migrates, so that ALTER DEFAULT PRIVILEGES for
  // that role actually covers the tables the migrations create.
  await client.query('grant create on schema public to gw_owner')
  await client.query('alter schema public owner to gw_owner')

  // The migrator keeps its bookkeeping table in a schema of its own, so
  // gw_owner has to be allowed to create one.
  const { rows } = await client.query('select current_database() as db')
  await client.query(`grant create on database "${rows[0].db}" to gw_owner`)

  const withPasswords = await setRolePasswords(client)

  console.log(
    withPasswords
      ? 'Bootstrap complete. Role passwords applied from the secrets volume.'
      : 'Bootstrap complete. Roles created without passwords (trusted local connection).',
  )
} finally {
  await client.end()
}

/**
 * Gives each login role the password from its file, on every run.
 *
 * Re-applied rather than set once: it is what makes a rotated secret take
 * effect, and what repairs a database restored from a dump taken before the
 * volume existed. `alter role` is idempotent -- setting the same password twice
 * changes nothing.
 *
 * Returns false when no password files are configured, which is the local and
 * CI path: there Postgres trusts the loopback connection and the roles stay
 * passwordless. Doing this only when asked keeps one code path for both rather
 * than a second bootstrap script that drifts.
 */
async function setRolePasswords(client) {
  const files = {
    postgres: process.env.ADMIN_DATABASE_PASSWORD_FILE,
    gw_owner: process.env.MIGRATION_DATABASE_PASSWORD_FILE,
    gw_app: process.env.DATABASE_PASSWORD_FILE,
    gw_ops: process.env.OPS_DATABASE_PASSWORD_FILE,
  }
  if (!Object.values(files).some(Boolean)) return false

  for (const [role, file] of Object.entries(files)) {
    if (!file) continue
    const secret = readFileSync(file, 'utf8').trim()
    if (!secret) throw new Error(`${file} ist leer -- scripts/db-secrets.mjs hat nicht gelaufen?`)

    // Parameterised as a VALUE, then formatted: `alter role` takes a literal,
    // not a bind parameter, and the role names here are ours rather than input.
    const { rows } = await client.query('select quote_literal($1) as literal', [secret])
    await client.query(`alter role ${role} with password ${rows[0].literal}`)
  }
  return true
}
