#!/usr/bin/env node
/**
 * Read-only data checks that run BEFORE any migration touches the database.
 *
 * A generated migration can add a constraint; it cannot say what has to be true
 * of the existing rows for that constraint to be addable. When it isn't, the
 * operator gets a bare `23503` from Postgres in the middle of a migration run,
 * `app` never starts because of the service_completed_successfully dependency,
 * and nothing says which rows are at fault or what the right repair is.
 *
 * So every constraint with a data precondition gets an entry in CHECKS below.
 * The run happens before the first write, reads only, and either says nothing
 * is in the way or names the rows and the decision to be made about them.
 *
 *   ADMIN_DATABASE_URL=postgres://postgres@/goodworkshop?host=/var/run/postgresql \
 *   node scripts/preflight.mjs
 */
import pg from 'pg'
import { dbOptions } from './db-connect.mjs'

const SAMPLE_LIMIT = 10

/**
 * The checks, one per constraint that a generated migration cannot enforce on
 * its own. A new migration with a data precondition means a new entry here --
 * see docs/installation-and-upgrade.md.
 *
 * `relevant` keeps a check silent once its constraint exists: on a database
 * that already carries it, the constraint itself is the guarantee and the query
 * would only cost a table scan on every boot.
 */
const CHECKS = [
  {
    id: 'module.day_id zeigt auf einen Tag eines anderen Workshops',
    migration: '0002_careless_avengers',
    relevant: (c) => missingCompositeDayFk(c, 'module'),
    find: `select m.id as module_id, m.workshop_id, d.workshop_id as tag_gehoert_zu_workshop
             from module m join workshop_day d on d.id = m.day_id
            where d.workshop_id is distinct from m.workshop_id
            limit ${SAMPLE_LIMIT}`,
    explain: [
      'The new composite FK requires a block to sit on a day of the SAME workshop.',
      'Rows where that is not true could be produced by the IDOR finding: a `moveModule` onto',
      'a day that belongs to someone else. They point at a workshop they never belonged to.',
      'The decision: does the block belong to the workshop of its day (then align',
      '`workshop_id`) or back onto a day of its own (then set `day_id`)?',
    ],
    inspect: `select m.id, m.title, m.workshop_id, d.id as day_id, d.workshop_id as day_workshop
  from module m join workshop_day d on d.id = m.day_id
 where d.workshop_id is distinct from m.workshop_id;`,
  },
  {
    id: 'cluster.day_id zeigt auf einen Tag eines anderen Workshops',
    migration: '0002_careless_avengers',
    relevant: (c) => missingCompositeDayFk(c, 'cluster'),
    find: `select k.id as cluster_id, k.workshop_id, d.workshop_id as tag_gehoert_zu_workshop
             from cluster k join workshop_day d on d.id = k.day_id
            where d.workshop_id is distinct from k.workshop_id
            limit ${SAMPLE_LIMIT}`,
    explain: [
      'The same for clusters: the group sits on a day that belongs to a different workshop.',
      'Decide it together with the blocks inside it -- moving a cluster without its blocks',
      'leaves the two in different places.',
    ],
    inspect: `select k.id, k.title, k.workshop_id, d.id as day_id, d.workshop_id as day_workshop
  from cluster k join workshop_day d on d.id = k.day_id
 where d.workshop_id is distinct from k.workshop_id;`,
  },
]

/**
 * THE CONNECTION MATTERS MORE THAN THE QUERIES.
 *
 * Every policy in this schema is written `TO gw_app`, and every table is under
 * FORCE ROW LEVEL SECURITY -- which applies to the table owner too. So the
 * migration role gw_owner, which owns all of them, has no applicable policy at
 * all and reads back an empty set from every table here.
 *
 * A preflight over that connection would find nothing wrong on a database full
 * of broken rows and wave the operator straight into the failure it exists to
 * prevent. It therefore insists on a connection that is genuinely exempt --
 * superuser or BYPASSRLS -- and refuses to report anything otherwise. Read-only
 * and cross-tenant by necessity: the question is about rows in every tenant,
 * asked by the operator already holding the superuser socket that db-bootstrap
 * uses.
 */
const url = process.env.ADMIN_DATABASE_URL
if (!url) {
  fail(
    'ADMIN_DATABASE_URL is missing -- the preflight needs a connection RLS does not filter.',
    'Jede Policy dieses Schemas gilt `to gw_app`, und alle Tabellen stehen unter FORCE ROW LEVEL',
    'SECURITY. Read through the migration role every table would come back empty, making this',
    'a guarantee that checked nothing. Better to stop loudly than to wave it through quietly.',
  )
}

const client = new pg.Client(dbOptions(url, process.env.ADMIN_DATABASE_PASSWORD_FILE))
await client.connect()

try {
  await assertSeesEveryRow(client)

  if (!(await hasTable(client, 'workshop_day'))) {
    console.log('Preflight: empty database, nothing to check.')
  } else {
    const blocking = []
    for (const check of CHECKS) {
      if (!(await check.relevant(client))) continue
      const { rows } = await client.query(check.find)
      if (rows.length > 0) blocking.push({ check, rows })
    }

    if (blocking.length === 0) {
      console.log('Preflight passed: no rows stand in the way of the pending migrations.')
    } else {
      report(blocking)
      process.exitCode = 1
    }
  }
} finally {
  await client.end()
}

function report(blocking) {
  console.error('')
  console.error('  MIGRATION STOPPED -- before the first change, not halfway through.')
  console.error('')

  for (const { check, rows } of blocking) {
    const more = rows.length === SAMPLE_LIMIT ? '+' : ''
    console.error(`  ${check.id}  (migration ${check.migration})`)
    console.error('')
    for (const line of check.explain) console.error(`    ${line}`)
    console.error('')
    console.error(`    Affected: ${rows.length}${more} row(s)`)
    for (const row of rows) console.error(`      ${JSON.stringify(row)}`)
    console.error('')
    console.error('    To look for yourself:')
    for (const line of check.inspect.trim().split('\n')) console.error(`      ${line}`)
    console.error('')
  }

  console.error('  The database is unchanged. Where these rows belong is a question about')
  console.error('  content -- this script does not guess it.')
  console.error('')
}

/**
 * Proves the connection actually sees every row before any check is believed.
 *
 * Without this the script's whole promise rests on ADMIN_DATABASE_URL pointing
 * where its name says -- and an operator who pointed it at gw_owner would get a
 * confident green light from queries that came back empty because they were
 * filtered, not because the data is sound.
 */
async function assertSeesEveryRow(client) {
  const { rows } = await client.query(
    `select current_user as role,
            current_setting('is_superuser') = 'on' as superuser,
            (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls`,
  )
  const { role, superuser, bypassrls } = rows[0]
  if (superuser || bypassrls) return

  fail(
    `ADMIN_DATABASE_URL verbindet als "${role}" -- diese Rolle unterliegt RLS.`,
    'Unter FORCE ROW LEVEL SECURITY liest sie aus jeder Tabelle dieses Schemas eine leere Menge,',
    'and the preflight would declare a broken database clean. What is expected is the',
    'Superuser-Verbindung, die auch db-bootstrap benutzt.',
  )
}

async function hasTable(client, name) {
  const { rows } = await client.query('select to_regclass($1) as oid', [`public.${name}`])
  return rows[0].oid !== null
}

/**
 * Asks whether the (tenant_id, workshop_id, day_id) -> workshop_day foreign key
 * is already there, by its COLUMNS rather than by its name.
 *
 * Drizzle's generated name for it is 76 characters and Postgres silently
 * truncates identifiers at 63, so the name in pg_constraint is not the name in
 * the migration file. Matching on it would mean matching on a string neither
 * side actually writes down.
 */
async function missingCompositeDayFk(client, table) {
  const { rows } = await client.query(
    `select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_class r on r.oid = c.confrelid
      where c.contype = 'f'
        and t.relname = $1
        and r.relname = 'workshop_day'
        and (
          select array_agg(a.attname::text order by a.attname)
            from unnest(c.conkey) as k(attnum)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        ) = array['day_id', 'tenant_id', 'workshop_id']`,
    [table],
  )
  return rows.length === 0
}

function fail(...lines) {
  console.error('')
  for (const line of lines) console.error(`  ${line}`)
  console.error('')
  process.exit(1)
}
