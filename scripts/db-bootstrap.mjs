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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.env.ADMIN_DATABASE_URL
if (!url) {
  console.error('ADMIN_DATABASE_URL is required (a superuser connection).')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
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

  console.log('Bootstrap complete. Roles created without passwords (peer auth over the socket).')
} finally {
  await client.end()
}
