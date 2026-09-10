import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { withoutTenant } from '@/server/db'

/**
 * What a container reports about itself.
 *
 * The contract: a rolling deploy whose migration has not been applied yet must
 * FAIL its healthcheck rather than serve pages against a schema it does not
 * understand. Every check is fail-closed -- an unknown state is not a healthy
 * state.
 */

export type Check = { name: string; ok: boolean; detail?: string }

export async function runChecks(): Promise<Check[]> {
  const database = await checkDatabase()
  // Only worth asking once the connection is known to work; otherwise it
  // reports a second failure for the same cause.
  if (!database.ok) return [database]

  return [database, await checkMigrations()]
}

async function checkDatabase(): Promise<Check> {
  try {
    await withoutTenant((tx) => tx.execute(sql`select 1`))
    return { name: 'database', ok: true }
  } catch (error) {
    return { name: 'database', ok: false, detail: message(error) }
  }
}

async function checkMigrations(): Promise<Check> {
  try {
    const journal = JSON.parse(
      await readFile(join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] }

    const rows = await withoutTenant((tx) =>
      tx.execute(sql`select count(*)::int as applied from drizzle.__drizzle_migrations`),
    )
    const applied = Number((rows.rows[0] as { applied: number } | undefined)?.applied ?? 0)

    return migrationState(
      journal.entries.map((entry) => entry.tag),
      applied,
    )
  } catch (error) {
    return { name: 'migrations', ok: false, detail: message(error) }
  }
}

/**
 * The image's expectation against the database's reality.
 *
 * Behind is fatal: the code is newer than the schema, so pages would run
 * against columns that do not exist yet.
 *
 * AHEAD is reported and tolerated. During a rolling deploy the migration runs
 * first and the old containers keep serving until they are replaced -- that is
 * the intended state, and failing it would mean every deploy takes the
 * installation down on its way through.
 */
export function migrationState(expected: string[], applied: number): Check {
  if (applied < expected.length) {
    const missing = expected.slice(applied)
    return {
      name: 'migrations',
      ok: false,
      detail: `${applied}/${expected.length} angewendet. Fehlt: ${missing.join(', ')}`,
    }
  }

  return {
    name: 'migrations',
    ok: true,
    detail:
      applied > expected.length
        ? `Datenbank ist voraus (${applied}/${expected.length})`
        : undefined,
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : 'unbekannter Fehler')
