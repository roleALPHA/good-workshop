import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { blocksOf, seedFromDayDoc } from '@/domain/collab/doc'
import { patchBlock, setDayFields } from '@/domain/collab/ops'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { flattenDay } from '@/features/agenda/flatten'
import { withTenant, type Actor } from '@/server/db'
import { appendUpdate, compact, loadDoc } from './store'
import { materializeDay } from './materialize'

/**
 * The round trip: edits made as a CRDT end up in the relational tables that
 * export, print and the MCP tools read.
 *
 * Against a real database because the interesting failures are relational --
 * a module whose cluster was deleted concurrently, a delete that has to happen
 * in the right order to satisfy a foreign key.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let identityId: string
let memberId: string
let workshopId: string
let dayId: string
let breakTypeId: string
// Real UUIDs: the relational columns are uuid, so readable stand-ins like "m1"
// would only ever fail at the database boundary.
let clusterId: string
let firstId: string
let secondId: string

const actor = (): Actor => ({ tenantId: TENANT, memberId, tenantRole: 'member', source: 'web' })

beforeAll(async () => {
  await ops.connect()
  identityId = randomUUID()
  memberId = randomUUID()
  await ops.query('insert into identity (id, email) values ($1, $2)', [
    identityId,
    `collab-${identityId}@example.test`,
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
  clusterId = uuidv7()
  firstId = uuidv7()
  secondId = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Collab', $3, 'a0')`,
    [workshopId, TENANT, memberId],
  )
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
    [dayId, TENANT, workshopId],
  )
})

/** A day with two blocks, as a CRDT already persisted to the log. */
async function seedLog() {
  const doc = new Y.Doc()
  seedFromDayDoc(doc, {
    id: dayId,
    workshopId,
    title: 'Tag 1',
    date: null,
    startMinute: 540,
    targetEndMinute: null,
    desc: {},
    clusters: [
      {
        id: clusterId,
        title: 'Warm-up',
        color: null,
        pinnedStartMinute: null,
        collapsed: false,
        targetDurationMinutes: null,
        order: 0,
      },
    ],
    modules: [
      {
        id: firstId,
        clusterId,
        moduleTypeId: breakTypeId,
        title: 'Erster Block',
        durationMinutes: 15,
        pinnedStartMinute: null,
        desc: {},
        parked: false,
        order: 0,
      },
      {
        id: secondId,
        clusterId: null,
        moduleTypeId: breakTypeId,
        title: 'Zweiter Block',
        durationMinutes: 30,
        pinnedStartMinute: null,
        desc: {},
        parked: false,
        order: 1,
      },
    ],
    moduleTypes: {},
  })

  await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
  return doc
}

const relationalShape = () =>
  withTenant(actor(), async (tx) => {
    const access = await assertWorkshopAccess(tx, actor(), workshopId, 'workshop.read')
    const { doc } = await loadDay(tx, access, dayId, 'de')
    return flattenDay(doc).map((row) => (row.depth === 1 ? `  ${row.id}` : row.id))
  })

const materialize = () => withTenant(actor(), (tx) => materializeDay(tx, workshopId, dayId))

describe('what the document is allowed to write into json_desc', () => {
  it('accepts a desc that matches the module type', async () => {
    const doc = await seedLog()
    patchBlock(doc, firstId, { desc: { materials: ['Moderationskarten'] } })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    const { rows } = await ops.query('select json_desc from module where id = $1', [firstId])
    expect(rows[0]?.json_desc).toMatchObject({ materials: ['Moderationskarten'] })
  })

  /**
   * The gap this closes: the editor stopped using the server action that
   * validated `desc`, so between the CRDT move and now, whatever the shared
   * document held went into the column unchecked -- and json_desc is rendered,
   * exported and handed to MCP clients.
   */
  it('keeps the last valid value when the document holds something the schema refuses', async () => {
    const doc = await seedLog()
    patchBlock(doc, firstId, { desc: { materials: ['Gültig'] } })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    // additionalProperties: false -- an invented field is refused.
    patchBlock(doc, firstId, { desc: { erfundenesFeld: 'kommt hier nicht durch' } })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    const { rows } = await ops.query('select json_desc from module where id = $1', [firstId])
    expect(rows[0]?.json_desc).toMatchObject({ materials: ['Gültig'] })
    expect(rows[0]?.json_desc).not.toHaveProperty('erfundenesFeld')
  })

  it('lets the rest of the day through rather than freezing it for one bad block', async () => {
    const doc = await seedLog()
    patchBlock(doc, firstId, { desc: { erfundenesFeld: 'ungültig' } })
    patchBlock(doc, secondId, { title: 'Umbenannt, während der andere kaputt ist' })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))

    // Does not throw, and the healthy block lands.
    await materialize()

    const { rows } = await ops.query('select title from module where id = $1', [secondId])
    expect(rows[0]?.title).toBe('Umbenannt, während der andere kaputt ist')
  })

  it('gives a new block an empty desc rather than an unchecked one', async () => {
    const doc = await seedLog()
    patchBlock(doc, firstId, { desc: { erfundenesFeld: 'ungültig' } })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    // Never materialised with a valid value, so there is nothing to keep.
    const { rows } = await ops.query('select json_desc from module where id = $1', [firstId])
    expect(rows[0]?.json_desc).toEqual({})
  })
})

describe('a parked block', () => {
  it('keeps its row, marked as parked', async () => {
    const doc = await seedLog()
    patchBlock(doc, firstId, { parked: true })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    const { rows } = await ops.query('select id, parked, title from module where day_id = $1', [
      dayId,
    ])
    // Still there -- parking is not deleting, which is the entire point.
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === firstId)).toMatchObject({ parked: true })
    expect(rows.find((r) => r.id === secondId)).toMatchObject({ parked: false })
  })

  it('comes back into the schedule when it is unparked', async () => {
    const doc = await seedLog()
    patchBlock(doc, firstId, { parked: true })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()
    expect(await relationalShape()).not.toContain(`  ${firstId}`)

    patchBlock(doc, firstId, { parked: false })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()
    expect(await relationalShape()).toContain(`  ${firstId}`)
  })
})

describe('the note on the day', () => {
  it('travels from the shared document into workshop_day.json_desc', async () => {
    const doc = await seedLog()

    // Written the way the editor writes it: onto the day map of the shared
    // document, not into the table. The day has one writer.
    setDayFields(doc, { desc: { text: 'Raum 2.14, Schlüssel beim Empfang.' } })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    const { rows } = await ops.query('select json_desc from workshop_day where id = $1', [dayId])
    expect(rows[0]?.json_desc).toEqual({ text: 'Raum 2.14, Schlüssel beim Empfang.' })

    // And it comes back out again, which is what the page renders from.
    const loaded = await withTenant(actor(), async (tx) => {
      const access = await assertWorkshopAccess(tx, actor(), workshopId, 'workshop.read')
      return loadDay(tx, access, dayId, 'de')
    })
    expect(loaded.doc.desc).toEqual({ text: 'Raum 2.14, Schlüssel beim Empfang.' })
  })

  it('clears out again when the note is emptied', async () => {
    const doc = await seedLog()
    setDayFields(doc, { desc: { text: 'Erst da' } })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    setDayFields(doc, { desc: {} })
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc)))
    await materialize()

    const { rows } = await ops.query('select json_desc from workshop_day where id = $1', [dayId])
    expect(rows[0]?.json_desc).toEqual({})
  })
})

describe('materialising the CRDT', () => {
  it('writes the whole day into the relational tables', async () => {
    await seedLog()
    const result = await materialize()

    expect(result.status).toBe('written')
    expect(result.blocks).toBe(3)
    expect(await relationalShape()).toEqual([clusterId, `  ${firstId}`, secondId])
  })

  it('does nothing when nothing has changed since last time', async () => {
    await seedLog()
    await materialize()
    // The point of collab_state: "is the database behind, and by how much" has
    // an answer, so an idle day costs no writes at all.
    expect((await materialize()).status).toBe('unchanged')
  })

  it('says so plainly when a day has no CRDT state yet', async () => {
    expect((await materialize()).status).toBe('no_state')
  })

  it('carries two clients’ concurrent edits through to the tables', async () => {
    const base = await seedLog()

    const a = new Y.Doc()
    Y.applyUpdate(a, Y.encodeStateAsUpdate(base))
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(base))

    blocksOf(a).get(firstId)!.set('title', 'Umbenannt von A')
    blocksOf(b).get(secondId)!.set('durationMinutes', 45)

    await withTenant(actor(), async (tx) => {
      await appendUpdate(tx, dayId, Y.encodeStateAsUpdate(a, Y.encodeStateVector(base)))
      await appendUpdate(tx, dayId, Y.encodeStateAsUpdate(b, Y.encodeStateVector(base)))
    })

    await materialize()

    const { rows } = await ops.query(
      'select id, title, duration_minutes from module where day_id = $1 order by position',
      [dayId],
    )
    expect(rows.find((r) => r.id === firstId).title).toBe('Umbenannt von A')
    expect(rows.find((r) => r.id === secondId).duration_minutes).toBe(45)
  })

  it('removes blocks that the CRDT no longer holds', async () => {
    const doc = await seedLog()
    await materialize()

    const update = Y.encodeStateVector(doc)
    blocksOf(doc).delete(secondId)
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc, update)))

    const result = await materialize()
    expect(result.removed).toBe(1)
    expect(await relationalShape()).toEqual([clusterId, `  ${firstId}`])
  })

  it('rescues a module whose cluster was deleted underneath it', async () => {
    const doc = await seedLog()
    await materialize()

    const before = Y.encodeStateVector(doc)
    // One person deletes the section while another is moving a block into it.
    blocksOf(doc).delete(clusterId)
    await withTenant(actor(), (tx) => appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc, before)))

    const result = await materialize()

    // The block lands on the day rather than taking the whole write down with
    // it: the composite FK would otherwise reject one orphan and lose the
    // entire materialisation.
    expect(result.status).toBe('written')
    expect(await relationalShape()).toEqual([firstId, secondId])
  })

  it('bumps content_version, so other readers notice', async () => {
    await seedLog()
    const first = await materialize()
    expect(first.contentVersion).toBeGreaterThan(1n)
  })
})

describe('the update log', () => {
  it('replays to the same document it was written from', async () => {
    const original = await seedLog()
    const replayed = await withTenant(actor(), (tx) => loadDoc(tx, dayId))

    expect(blocksOf(replayed.doc).size).toBe(blocksOf(original).size)
    expect(blocksOf(replayed.doc).get(firstId)!.get('title')).toBe('Erster Block')
  })

  it('leaves a short log alone', async () => {
    await seedLog()
    expect(await withTenant(actor(), (tx) => compact(tx, dayId))).toBeNull()
  })

  it('folds a long log into one row without changing the document', async () => {
    const doc = await seedLog()

    // 250 tiny edits, the way a real editing session accumulates them.
    await withTenant(actor(), async (tx) => {
      for (let i = 0; i < 250; i++) {
        const before = Y.encodeStateVector(doc)
        blocksOf(doc)
          .get(firstId)!
          .set('durationMinutes', 10 + i)
        await appendUpdate(tx, dayId, Y.encodeStateAsUpdate(doc, before))
      }
    })

    const result = await withTenant(actor(), (tx) => compact(tx, dayId))
    expect(result?.compacted).toBeGreaterThan(200)

    const after = await withTenant(actor(), (tx) => loadDoc(tx, dayId))
    expect(after.rows).toBe(1)
    // Compaction is an optimisation, never a correctness requirement: the
    // folded log must replay to exactly the same document.
    expect(blocksOf(after.doc).get(firstId)!.get('durationMinutes')).toBe(259)
  })
})
