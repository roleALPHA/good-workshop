import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * "A breakout has strands, a strand has blocks -- and there are no more levels."
 *
 * This file is the only place that statement lives. It is not a convention the
 * application keeps: it is three constraints that together make a third level
 * unrepresentable, and the point of testing them here is that no amount of
 * application code -- a drag, a keystroke, a model over MCP, a restore from a
 * dump -- can produce a shape the rest of the system has no meaning for.
 *
 * The trick being verified: an FK cannot demand "the row you point at must have
 * mode='parallel'", so `parent_mode` is a generated constant that says it for
 * the FK to compare against. If a future Postgres stopped allowing a foreign key
 * over a generated column, these tests are where that shows up -- loudly, and
 * before anyone's data depends on it.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

const tenantA = { id: randomUUID(), memberId: randomUUID(), identityId: randomUUID() }
const tenantB = { id: randomUUID(), memberId: randomUUID(), identityId: randomUUID() }

const workshopA = randomUUID()
const dayOne = randomUUID()
const dayTwo = randomUUID()
const workshopB = randomUUID()
const dayB = randomUUID()
const moduleTypeA = randomUUID()

/** Inserts a cluster, returning the database's complaint instead of throwing. */
async function insertCluster(row: {
  id: string
  tenantId?: string
  workshopId?: string
  dayId?: string
  mode?: string
  parent?: string | null
  position?: string
}): Promise<string | null> {
  try {
    await ops.query(
      `insert into cluster (id, tenant_id, workshop_id, day_id, title, position, mode, parent_cluster_id)
       values ($1, $2, $3, $4, 'x', $5, $6, $7)`,
      [
        row.id,
        row.tenantId ?? tenantA.id,
        row.workshopId ?? workshopA,
        row.dayId ?? dayOne,
        row.position ?? row.id.slice(0, 8),
        row.mode ?? 'sequential',
        row.parent ?? null,
      ],
    )
    return null
  } catch (error) {
    return (error as { constraint?: string }).constraint ?? String(error)
  }
}

beforeAll(async () => {
  await ops.connect()
  for (const t of [tenantA, tenantB]) {
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Test')`, [
      t.id,
      `t-${t.id.slice(0, 8)}`,
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
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'W', $3, 'a0')`,
    [workshopA, tenantA.id, tenantA.memberId],
  )
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'W', $3, 'a0')`,
    [workshopB, tenantB.id, tenantB.memberId],
  )
  // A module type of tenant A's own: the FK on module is composite, so a
  // built-in belonging to some other tenant is not a type this block may use.
  await ops.query(
    `insert into module_type (id, tenant_id, key, name, json_schema)
     values ($1, $2, 'probe', 'Probe', '{"type":"object"}'::jsonb)`,
    [moduleTypeA, tenantA.id],
  )
  for (const [id, workshopId, tenant] of [
    [dayOne, workshopA, tenantA.id],
    [dayTwo, workshopA, tenantA.id],
    [dayB, workshopB, tenantB.id],
  ] as const) {
    await ops.query(
      `insert into workshop_day (id, tenant_id, workshop_id, title, position) values ($1, $2, $3, 'D', 'a0')`,
      [id, tenant, workshopId],
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

describe('cluster nesting', () => {
  it('takes a breakout with two strands', async () => {
    const breakout = randomUUID()
    expect(await insertCluster({ id: breakout, mode: 'parallel' })).toBeNull()
    expect(await insertCluster({ id: randomUUID(), parent: breakout })).toBeNull()
    expect(await insertCluster({ id: randomUUID(), parent: breakout })).toBeNull()
  })

  it('refuses a third level: a strand cannot hold a cluster', async () => {
    const breakout = randomUUID()
    const strand = randomUUID()
    await insertCluster({ id: breakout, mode: 'parallel' })
    await insertCluster({ id: strand, parent: breakout })

    // The strand is sequential, so it is not in the (id, 'parallel') key space
    // the FK looks in. That is the whole mechanism.
    expect(await insertCluster({ id: randomUUID(), parent: strand })).toBe('cluster_parent_fk')
  })

  it('refuses a breakout inside a breakout', async () => {
    const breakout = randomUUID()
    await insertCluster({ id: breakout, mode: 'parallel' })
    expect(await insertCluster({ id: randomUUID(), mode: 'parallel', parent: breakout })).toBe(
      'cluster_nesting',
    )
  })

  it('refuses a strand whose breakout is on another day', async () => {
    const breakout = randomUUID()
    await insertCluster({ id: breakout, mode: 'parallel', dayId: dayOne })
    expect(await insertCluster({ id: randomUUID(), dayId: dayTwo, parent: breakout })).toBe(
      'cluster_parent_fk',
    )
  })

  it('refuses a strand whose breakout belongs to another tenant', async () => {
    const breakout = randomUUID()
    await insertCluster({ id: breakout, mode: 'parallel' })
    // Everything else about this row is valid -- only the tenant differs. Without
    // tenant_id in the FK this would be a perfectly ordinary insert, and one
    // tenant's agenda would hang inside another's.
    expect(
      await insertCluster({
        id: randomUUID(),
        tenantId: tenantB.id,
        workshopId: workshopB,
        dayId: dayB,
        parent: breakout,
      }),
    ).toBe('cluster_parent_fk')
  })

  it('refuses a mode it has no meaning for', async () => {
    expect(await insertCluster({ id: randomUUID(), mode: 'simultaneous' })).toBe('cluster_mode')
  })

  it('takes strands and blocks with the breakout when it is deleted', async () => {
    const breakout = randomUUID()
    const strand = randomUUID()
    const block = randomUUID()
    await insertCluster({ id: breakout, mode: 'parallel' })
    await insertCluster({ id: strand, parent: breakout })
    await ops.query(
      `insert into module (id, tenant_id, workshop_id, day_id, cluster_id, title, position, module_type_id, type_version)
       values ($1, $2, $3, $4, $5, 'B', 'a0', $6, 1)`,
      [block, tenantA.id, workshopA, dayOne, strand, moduleTypeA],
    )

    await ops.query('delete from cluster where id = $1', [breakout])

    const clusters = await ops.query('select id from cluster where id = any($1)', [
      [breakout, strand],
    ])
    const blocks = await ops.query('select id from module where id = $1', [block])
    expect(clusters.rows).toHaveLength(0)
    expect(blocks.rows).toHaveLength(0)
  })

  it('keeps the breakout when only a strand is deleted', async () => {
    const breakout = randomUUID()
    const strand = randomUUID()
    await insertCluster({ id: breakout, mode: 'parallel' })
    await insertCluster({ id: strand, parent: breakout })

    await ops.query('delete from cluster where id = $1', [strand])

    const left = await ops.query('select id from cluster where id = any($1)', [[breakout, strand]])
    expect(left.rows.map((r) => r.id)).toEqual([breakout])
  })
})
