#!/usr/bin/env node
/**
 * Applies schema migrations as gw_owner, then enforces the invariants that a
 * generated migration cannot express.
 *
 * Guarded by an advisory lock so that N application replicas rolling out at
 * once cannot race each other into a half-applied schema.
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { dbOptions } from './db-connect.mjs'
import { builtEdition } from './edition.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
  console.error('MIGRATION_DATABASE_URL (or DATABASE_URL) is required.')
  process.exit(1)
}
if (!process.env.MIGRATION_DATABASE_URL) {
  console.warn(
    '! Running migrations with DATABASE_URL. The application is then running with migration privileges;\n' +
      '! set MIGRATION_DATABASE_URL (gw_owner) and DATABASE_URL (gw_app) separately in production.',
  )
}

const client = new pg.Client(
  dbOptions(
    url,
    process.env.MIGRATION_DATABASE_URL
      ? process.env.MIGRATION_DATABASE_PASSWORD_FILE
      : process.env.DATABASE_PASSWORD_FILE,
  ),
)
await client.connect()
const db = drizzle(client)

try {
  await db.execute(sql`select pg_advisory_lock(hashtext('gw_migrate'))`)

  await migrate(db, { migrationsFolder: join(root, 'drizzle') })

  // Runs after the tables exist, and is re-applied every time so an edit to the
  // function is picked up without a new migration file.
  //
  // Over the admin connection, because the file ends by handing the function to
  // gw_ops. After the first run gw_owner no longer owns it, and `create or
  // replace` by a non-owner is refused with 42501 -- so every migration after
  // the first one failed, and compose runs this on every `up` with the app
  // waiting on it. First install worked; the second start did not come up.
  await applyPatResolver()

  // Only in an image built as the cloud edition. Read from dist/edition.json,
  // which the build wrote -- not from the environment, which an operator sets.
  if (builtEdition() === 'cloud') await applyCloudMigrations()

  await forceRowLevelSecurity(db)
  await regrant(db)

  console.log('Migrations applied.')
} finally {
  await db.execute(sql`select pg_advisory_unlock(hashtext('gw_migrate'))`).catch(() => {})
  await client.end()
}

/**
 * The one statement in the migration path that needs more than gw_owner.
 *
 * ADMIN_DATABASE_URL is the same superuser connection db-bootstrap uses, and
 * compose already gives it to the migrate service for exactly this kind of
 * work. Where it is absent -- a first run driven by hand, or a database whose
 * operator kept migrations unprivileged -- gw_owner still owns the function and
 * can replace it itself, so falling back is correct rather than lenient.
 */
async function applyPatResolver() {
  // Every SECURITY DEFINER function in one connection: they have the same
  // owner, the same grant and the same reason to exist -- a question the
  // application's own role is deliberately unable to ask. Applying one without
  // the others leaves the MCP endpoint able to authenticate half its callers,
  // or an admin able to remove a member but not the account behind it.
  const files = [
    'drizzle/sql/900_pat_resolver.sql',
    'drizzle/sql/901_oauth_resolver.sql',
    'drizzle/sql/902_forget_identity.sql',
  ]
  const source = (await Promise.all(files.map((file) => readFile(join(root, file), 'utf8')))).join(
    '\n',
  )
  const adminUrl = process.env.ADMIN_DATABASE_URL

  if (!adminUrl) {
    await db.execute(sql.raw(source))
    return
  }

  const admin = new pg.Client(dbOptions(adminUrl, process.env.ADMIN_DATABASE_PASSWORD_FILE))
  await admin.connect()
  try {
    await admin.query(source)
  } finally {
    await admin.end()
  }
}

/**
 * The cloud edition's own migrations, from drizzle-cloud/.
 *
 * Kept apart from drizzle/ so that nothing in them can reach a self-hosted
 * database, and with a ledger of their own for the same reason: the drizzle
 * journal describes the community schema, and a file that exists in one
 * edition's journal and not the other's would make the health check's "is the
 * schema current" answer mean two different things.
 *
 * Numbered files run once, in order, each in its own transaction. Everything
 * under drizzle-cloud/sql/ is re-applied on every run, like the core resolvers,
 * so an edit to a function needs no new file.
 */
async function applyCloudMigrations() {
  const dir = join(root, 'drizzle-cloud')
  const files = (await readdir(dir)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()
  const functions = (await readdir(join(dir, 'sql'))).filter((name) => name.endsWith('.sql')).sort()

  const adminUrl = process.env.ADMIN_DATABASE_URL
  const runner = adminUrl
    ? new pg.Client(dbOptions(adminUrl, process.env.ADMIN_DATABASE_PASSWORD_FILE))
    : null
  const query = runner
    ? (text, values) => runner.query(text, values)
    : (text, values) => client.query(text, values)

  if (runner) await runner.connect()
  try {
    await query(
      `create table if not exists drizzle.cloud_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    )
    const { rows } = await query('select name from drizzle.cloud_migrations')
    const applied = new Set(rows.map((row) => row.name))

    for (const name of files) {
      if (applied.has(name)) continue
      await query('begin')
      try {
        await query(await readFile(join(dir, name), 'utf8'))
        await query('insert into drizzle.cloud_migrations (name) values ($1)', [name])
        await query('commit')
        console.log(`  cloud migration ${name}`)
      } catch (error) {
        await query('rollback')
        throw error
      }
    }

    for (const name of functions) {
      await query(await readFile(join(dir, 'sql', name), 'utf8'))
    }
  } finally {
    if (runner) await runner.end()
  }
}

/**
 * ALTER DEFAULT PRIVILEGES only covers tables created AFTER it ran. Re-granting
 * on every migration means an existing database is repaired rather than left
 * subtly broken, and a table created before the grants existed does not turn
 * into a 500 that only happens in production.
 */
async function regrant(db) {
  await db.execute(
    sql`grant select, insert, update, delete on all tables in schema public to gw_app`,
  )
  await db.execute(sql`grant usage, select on all sequences in schema public to gw_app`)
  await db.execute(
    sql`grant select, insert, update, delete on all tables in schema public to gw_ops`,
  )
  await db.execute(sql`grant usage, select on all sequences in schema public to gw_ops`)

  // ...except the identity tables, which gw_app must reach only by stepping
  // into gw_auth explicitly. This revoke is why an ORM mistake outside the auth
  // module cannot read credential material.
  for (const table of [
    'identity',
    'webauthn_credential',
    'webauthn_challenge',
    'email_token',
    'auth_session',
    // Cloud only: a registration waiting for its confirmation link.
    'pending_signup',
  ]) {
    const exists = await db.execute(
      sql`select to_regclass(${`public.${table}`}) is not null as found`,
    )
    if (!exists.rows[0].found) continue
    await db.execute(sql.raw(`revoke all on table "${table}" from gw_app`))
    await db.execute(sql.raw(`grant select, insert, update, delete on table "${table}" to gw_auth`))
  }

  // The migration ledger, readable. The health endpoint compares what the
  // image ships against what the database has applied, and a rolling deploy
  // whose migration has not run yet has to FAIL that check rather than serve
  // pages against a schema it does not understand. Read-only, and there is
  // nothing secret in a list of file names.
  await db.execute(sql`grant usage on schema drizzle to gw_app, gw_ops`)
  await db.execute(sql`grant select on drizzle.__drizzle_migrations to gw_app, gw_ops`)
}

/**
 * The single highest-value guardrail in the system.
 *
 * A table's OWNER bypasses its own RLS policies unless they are FORCEd -- and
 * gw_owner owns every table here, because it runs the migrations. Drizzle's
 * .enableRLS() emits ENABLE but not FORCE, so without this loop every policy in
 * the schema would be decorative from the application's point of view.
 *
 * Applied to every table that has a policy, on every migration run, so a table
 * added next year cannot quietly miss it.
 */
async function forceRowLevelSecurity(db) {
  const result = await db.execute(sql`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (select 1 from pg_policy p where p.polrelid = c.oid)
      and not c.relforcerowsecurity
  `)

  for (const row of result.rows) {
    await db.execute(sql.raw(`alter table "${row.relname}" force row level security`))
    console.log(`  forced RLS on ${row.relname}`)
  }
}
