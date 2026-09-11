import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { withTenant } from './index'
import { workshop } from './schema'
import type { Actor } from './actor'

/**
 * The tenant boundary, verified against a real database.
 *
 * Two failures this file exists to catch, both of which are invisible to
 * ordinary testing:
 *
 *  1. A new table shipped without RLS. There is no symptom -- the feature works
 *     perfectly, and every tenant can read every other tenant's rows.
 *  2. A policy that is ENABLEd but not FORCEd. The owner role bypasses its own
 *     policies, and migrations run as the owner, so this looks correct in every
 *     manual check made with the migration connection.
 */

/**
 * Tables that legitimately have no tenant_id. See the identity layer in
 * schema.ts.
 *
 * `tenant` is deliberately NOT on this list. It has no tenant_id column, but it
 * has something better: its own id IS the tenant. A row per tenant carrying the
 * name, the slug, the settings and the branding is exactly the shape RLS exists
 * for, and leaving it out of the metadata test was the one gap in an otherwise
 * complete wall.
 */
const GLOBAL_TABLES = [
  'identity',
  'webauthn_credential',
  'webauthn_challenge',
  'email_token',
  'auth_session',
  '__drizzle_migrations',
]

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

const tenantA = { id: randomUUID(), memberId: randomUUID(), identityId: randomUUID() }
const tenantB = { id: randomUUID(), memberId: randomUUID(), identityId: randomUUID() }

const actor = (t: typeof tenantA): Actor => ({
  tenantId: t.id,
  memberId: t.memberId,
  tenantRole: 'member',
  source: 'web',
})

beforeAll(async () => {
  await ops.connect()
  for (const t of [tenantA, tenantB]) {
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, $3)`, [
      t.id,
      `t-${t.id.slice(0, 8)}`,
      'Test',
    ])
    await ops.query(`insert into identity (id, email) values ($1, $2)`, [
      t.identityId,
      `${t.identityId}@example.test`,
    ])
    await ops.query(
      `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
      [t.memberId, t.id, t.identityId],
    )
  }
})

afterAll(async () => {
  for (const t of [tenantA, tenantB]) {
    await ops.query('delete from tenant where id = $1', [t.id])
    await ops.query('delete from identity where id = $1', [t.identityId])
  }
  await ops.end()
})

describe('RLS metadata', () => {
  it('has row level security enabled, FORCED and policied on every tenant-scoped table', async () => {
    const { rows } = await ops.query(
      `select c.relname,
              c.relrowsecurity as enabled,
              c.relforcerowsecurity as forced,
              exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and c.relname <> all ($1::text[])`,
      [GLOBAL_TABLES],
    )

    expect(rows.length).toBeGreaterThan(10)

    const broken = rows.filter((r) => !r.enabled || !r.forced || !r.has_policy)
    expect(
      broken.map(
        (r) => `${r.relname} (enabled=${r.enabled} forced=${r.forced} policy=${r.has_policy})`,
      ),
    ).toEqual([])
  })
})

describe('tenant isolation', () => {
  it('hides another tenant’s rows completely', async () => {
    const workshopId = randomUUID()

    await withTenant(actor(tenantA), async (tx) => {
      // tenant_id is deliberately omitted: the column default is
      // app.current_tenant(), which is what removes "forgot to set tenant_id"
      // from the set of possible bugs.
      await tx.insert(workshop).values({
        id: workshopId,
        title: 'Nur für A',
        ownerId: tenantA.memberId,
        position: 'a0',
      })
    })

    const seenByA = await withTenant(actor(tenantA), (tx) =>
      tx.execute(sql`select id from workshop where id = ${workshopId}`),
    )
    expect(seenByA.rows).toHaveLength(1)

    const seenByB = await withTenant(actor(tenantB), (tx) =>
      tx.execute(sql`select id from workshop where id = ${workshopId}`),
    )
    // Not "forbidden" -- simply not there. That is what makes a leak impossible
    // rather than merely unlikely.
    expect(seenByB.rows).toHaveLength(0)
  })

  it('refuses a write that claims a foreign tenant', async () => {
    // Asserted on the SQLSTATE rather than the message: the ORM wraps the text,
    // and a regex over a wrapped message is the kind of assertion that keeps
    // passing after it has stopped meaning anything. 42501 is the code Postgres
    // raises for a WITH CHECK violation.
    const error = await withTenant(actor(tenantA), (tx) =>
      tx.execute(
        sql`insert into workshop (id, tenant_id, title, owner_id, position)
            values (${randomUUID()}, ${tenantB.id}, 'Untergeschoben', ${tenantB.memberId}, 'a0')`,
      ),
    ).then(
      () => null,
      (e: unknown) => e as { cause?: { code?: string; message?: string } },
    )

    expect(error).not.toBeNull()
    expect(error?.cause?.code).toBe('42501')
    expect(error?.cause?.message).toMatch(/row-level security/i)
  })

  it('sees nothing at all when no tenant is set', async () => {
    // The fail-closed property: current_setting returns NULL, tenant_id = NULL
    // is NULL, NULL is not true. There is no "forgot to set it and got
    // everything" state.
    const anonymous = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await anonymous.connect()
    try {
      const { rows } = await anonymous.query('select id from workshop')
      expect(rows).toHaveLength(0)
    } finally {
      await anonymous.end()
    }
  })

  it('hides another tenant’s own row in the tenant table', async () => {
    // The table the whole scheme is named after. Today the application role has
    // full DML on it and no policy stands in the way -- which is invisible in
    // the Community Edition, where there is only ever one row, and a
    // cross-tenant leak of names, slugs, settings and branding on the very
    // first day of the Cloud Edition.
    const seen = await withTenant(actor(tenantA), (tx) => tx.execute(sql`select id from tenant`))

    expect(seen.rows.map((r) => (r as { id: string }).id)).toEqual([tenantA.id])
  })

  it('refuses to rename another tenant', async () => {
    await withTenant(actor(tenantA), (tx) =>
      tx.execute(sql`update tenant set name = 'Übernommen' where id = ${tenantB.id}`),
    ).catch(() => undefined)

    const { rows } = await ops.query('select name from tenant where id = $1', [tenantB.id])
    expect(rows[0].name).toBe('Test')
  })

  it('keeps the identity tables out of reach of the application role', async () => {
    const asApp = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await asApp.connect()
    try {
      await expect(asApp.query('select * from identity')).rejects.toThrow(/permission denied/i)
    } finally {
      await asApp.end()
    }
  })
})
