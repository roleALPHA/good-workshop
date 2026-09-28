import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { blocksOf, seedFromDayDoc } from '@/domain/collab/doc'
import { patchBlock } from '@/domain/collab/ops'
import { withTenant, type Actor } from '@/server/db'
import { appendUpdate } from './store'
import { materializeDay } from './materialize'

/**
 * A breakout, all the way from the document into the tables.
 *
 * Its own file rather than more cases in materialize.db.test.ts: that one is
 * already 500 lines and proves a different thing. The interesting failures here
 * are relational and about ORDER -- a strand that has to exist before its
 * blocks, a section that becomes a strand in the same pass that its parent is
 * created, a delete that must not take rows the document still holds.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let identityId: string
let memberId: string
let workshopId: string
let dayId: string
let breakTypeId: string

const actor = (): Actor => ({ tenantId: TENANT, memberId, tenantRole: 'member', source: 'web' })

type Cluster = { id: string; parent: string | null; mode: 'sequential' | 'parallel'; order: number }
type Block = { id: string; cluster: string | null; order: number }

/** Seeds a day whose document already holds the given shape. */
async function seed(clusters: Cluster[], modules: Block[]): Promise<Y.Doc> {
  const doc = new Y.Doc()
  seedFromDayDoc(doc, {
    id: dayId,
    workshopId,
    title: 'Tag',
    date: null,
    startMinute: 540,
    targetEndMinute: null,
    desc: {},
    clusters: clusters.map((c) => ({
      id: c.id,
      parentClusterId: c.parent,
      mode: c.mode,
      title: c.id.slice(0, 8),
      color: null,
      pinnedStartMinute: null,
      collapsed: false,
      targetDurationMinutes: null,
      order: c.order,
    })),
    modules: modules.map((m) => ({
      id: m.id,
      clusterId: m.cluster,
      moduleTypeId: breakTypeId,
      title: m.id.slice(0, 8),
      durationMinutes: 15,
      pinnedStartMinute: null,
      desc: {},
      parked: false,
      responsible: [],
      order: m.order,
    })),
    moduleTypes: {},
  })
  await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
  return doc
}

const materialise = () =>
  withTenant(actor(), (tx) => materializeDay(tx, workshopId, dayId, { force: true }))

/** What the tables now say, in document order. */
async function storedClusters() {
  const { rows } = await ops.query(
    `select id, mode, parent_cluster_id from cluster where day_id = $1 order by position`,
    [dayId],
  )
  return rows as { id: string; mode: string; parent_cluster_id: string | null }[]
}

async function storedModules() {
  const { rows } = await ops.query(
    `select id, cluster_id from module where day_id = $1 order by position`,
    [dayId],
  )
  return rows as { id: string; cluster_id: string | null }[]
}

async function push(doc: Y.Doc, change: (d: Y.Doc) => void): Promise<void> {
  const before = Y.encodeStateVector(doc)
  change(doc)
  await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc, before)))
}

beforeAll(async () => {
  await ops.connect()
  identityId = randomUUID()
  memberId = randomUUID()
  await ops.query('insert into identity (id, email) values ($1, $2)', [
    identityId,
    `bo-${identityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
  const { rows } = await ops.query(
    `select id from module_type where tenant_id = $1 and key = 'break'`,
    [TENANT],
  )
  breakTypeId = rows[0].id
})

afterAll(async () => {
  await ops.query('delete from workshop where owner_id = $1', [memberId])
  await ops.query('delete from identity where id = $1', [identityId])
  await ops.end()
})

beforeEach(async () => {
  workshopId = uuidv7()
  dayId = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'BO', $3, 'a0')`,
    [workshopId, TENANT, memberId],
  )
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
    [dayId, TENANT, workshopId],
  )
})

describe('materialising a breakout', () => {
  it('writes the breakout, its strands and their blocks', async () => {
    const bo = uuidv7()
    const s1 = uuidv7()
    const s2 = uuidv7()
    const a = uuidv7()
    const b = uuidv7()
    await seed(
      [
        { id: bo, parent: null, mode: 'parallel', order: 0 },
        { id: s1, parent: bo, mode: 'sequential', order: 0 },
        { id: s2, parent: bo, mode: 'sequential', order: 1 },
      ],
      [
        { id: a, cluster: s1, order: 0 },
        { id: b, cluster: s2, order: 0 },
      ],
    )

    const result = await materialise()
    expect(result.status).toBe('written')

    const clusters = await storedClusters()
    expect(clusters.find((c) => c.id === bo)).toMatchObject({
      mode: 'parallel',
      parent_cluster_id: null,
    })
    expect(clusters.find((c) => c.id === s1)).toMatchObject({
      mode: 'sequential',
      parent_cluster_id: bo,
    })
    expect(await storedModules()).toEqual(
      expect.arrayContaining([
        { id: a, cluster_id: s1 },
        { id: b, cluster_id: s2 },
      ]),
    )
  })

  it('turns a strand dragged to the day into a section, keeping its blocks', async () => {
    const bo = uuidv7()
    const s1 = uuidv7()
    const a = uuidv7()
    const doc = await seed(
      [
        { id: bo, parent: null, mode: 'parallel', order: 0 },
        { id: s1, parent: bo, mode: 'sequential', order: 0 },
      ],
      [{ id: a, cluster: s1, order: 0 }],
    )
    await materialise()

    await push(doc, (d) => patchBlock(d, s1, { parentId: null }))
    const result = await materialise()

    expect(result.status).toBe('written')
    expect((await storedClusters()).find((c) => c.id === s1)).toMatchObject({
      parent_cluster_id: null,
    })
    // The point of the test: the work in the strand comes with it.
    expect(await storedModules()).toEqual([{ id: a, cluster_id: s1 }])
  })

  it('turns a section dragged into a breakout into a strand', async () => {
    const bo = uuidv7()
    const c = uuidv7()
    const a = uuidv7()
    const doc = await seed(
      [
        { id: bo, parent: null, mode: 'parallel', order: 0 },
        { id: c, parent: null, mode: 'sequential', order: 1 },
      ],
      [{ id: a, cluster: c, order: 0 }],
    )
    await materialise()

    await push(doc, (d) => patchBlock(d, c, { parentId: bo }))
    const result = await materialise()

    expect(result.status).toBe('written')
    expect((await storedClusters()).find((x) => x.id === c)).toMatchObject({
      parent_cluster_id: bo,
    })
    expect(await storedModules()).toEqual([{ id: a, cluster_id: c }])
  })

  it('removes strands and their blocks when the breakout goes', async () => {
    const bo = uuidv7()
    const s1 = uuidv7()
    const a = uuidv7()
    const doc = await seed(
      [
        { id: bo, parent: null, mode: 'parallel', order: 0 },
        { id: s1, parent: bo, mode: 'sequential', order: 0 },
      ],
      [{ id: a, cluster: s1, order: 0 }],
    )
    await materialise()

    await push(doc, (d) => {
      const blocks = blocksOf(d)
      d.transact(() => {
        blocks.delete(bo)
        blocks.delete(s1)
        blocks.delete(a)
      })
    })
    const result = await materialise()

    expect(result.status).toBe('written')
    expect(await storedClusters()).toEqual([])
    expect(await storedModules()).toEqual([])
  })

  it('rescues a block hanging on the breakout itself onto the day, and says so', async () => {
    const bo = uuidv7()
    const a = uuidv7()
    const doc = await seed([{ id: bo, parent: null, mode: 'parallel', order: 0 }], [])
    await push(doc, (d) => {
      const blocks = blocksOf(d)
      const block = new Y.Map<unknown>()
      d.transact(() => {
        block.set('kind', 'module')
        block.set('position', 'a1')
        block.set('parentId', bo)
        block.set('title', 'Lose')
        block.set('moduleTypeId', breakTypeId)
        block.set('durationMinutes', 15)
        blocks.set(a, block)
      })
    })

    await materialise()

    expect(await storedModules()).toEqual([{ id: a, cluster_id: null }])
    const { rows } = await ops.query(
      `select action, data from audit_event where entity_id = $1 and action = 'day.nesting_rescued'`,
      [workshopId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].data.blocks[0]).toMatchObject({ id: a, wanted: bo })
  })
})
