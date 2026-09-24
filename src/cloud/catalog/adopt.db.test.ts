import { randomUUID } from 'node:crypto'
import pg from 'pg'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { seedBuiltinModuleTypes } from '@/domain/moduleType/seed'
import type { DesignDetail, MethodDetail } from './ports'

/**
 * Adopting a design, against a real database and two tenants.
 *
 * ONE ASSERTION IS THE POINT OF THIS FILE, and it is the third one down: the
 * same design adopted by two workspaces must produce DISJOINT module-type ids
 * whose KEYS are identical. `module.module_type_id` is a composite foreign key
 * including tenant_id, and every workspace seeds its own rows -- so an id
 * carried over from the catalogue, or reused between tenants, names a row in
 * somebody else's tenant. Nothing else in the suite would catch it: the page
 * renders, the blocks look right, and the write fails only for whoever adopts
 * second.
 *
 * The room is faked. What `adoptDesign` does INSIDE a room -- and the fact
 * that a relational write there would be erased at the next materialise -- is
 * covered by src/server/collab/mcp-write.db.test.ts against a real server.
 * What is faked here is the transport, not the decision: the edit runs against
 * a real Y.Doc and the blocks it wrote are read back out of it.
 */

const CATALOGUE: DesignDetail = {
  id: randomUUID(),
  name: 'Strategietag',
  summary: 'Ein Tag.',
  body: '',
  translated: true,
  facets: [],
  minParticipants: null,
  maxParticipants: null,
  durationMinutes: 240,
  dayCount: 1,
  days: [
    {
      title: 'Tag 1',
      startMinute: 540,
      items: [
        {
          kind: 'cluster',
          title: 'Ankommen',
          color: 'slate',
          pinnedStartMinute: null,
          children: [
            {
              kind: 'module',
              moduleTypeKey: 'check_in',
              title: 'Check-in',
              durationMinutes: 15,
              pinnedStartMinute: null,
              parked: false,
              description: 'Alle kommen einmal zu Wort.',
            },
          ],
        },
        {
          kind: 'module',
          moduleTypeKey: 'nonesuch',
          title: 'Etwas Erfundenes',
          durationMinutes: 30,
          pinnedStartMinute: null,
          parked: false,
          description: '',
        },
      ],
    },
  ],
}

/**
 * Two methods: one whose block type every workspace has, one whose it does not.
 *
 * `body` is empty and the prose sits in `summary`, because that is the shape
 * every method in the shipped library actually has -- see method-body.ts.
 */
const METHOD: MethodDetail = {
  id: randomUUID(),
  slug: 'check-in',
  name: 'Check-in',
  summary: 'Alle kommen einmal zu Wort.',
  body: '',
  translated: true,
  facets: [],
  minParticipants: null,
  maxParticipants: null,
  durationMinutes: 15,
  moduleTypeKey: 'check_in',
}

const ODD_METHOD: MethodDetail = {
  ...METHOD,
  id: randomUUID(),
  slug: 'erfunden',
  name: 'Etwas Erfundenes',
  summary: '',
  moduleTypeKey: 'nonesuch',
}

const METHODS = new Map([
  [METHOD.id, METHOD],
  [ODD_METHOD.id, ODD_METHOD],
])

vi.mock('@gw/catalog', () => ({
  catalog: {
    getDesign: async () => CATALOGUE,
    getMethodById: async (id: string) => METHODS.get(id) ?? null,
  },
}))

const { adoptDesign, adoptMethod } = await import('./adopt')
const { NotFoundError } = await import('@/domain/agenda/access')

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const TENANTS = [randomUUID(), randomUUID()]
const members: Record<string, string> = {}
const identities: string[] = []

const as = (tenantId: string): Actor => ({
  tenantId,
  memberId: members[tenantId]!,
  tenantRole: 'admin',
  source: 'web',
})

/** Applies the edit to a real document and hands back what it wrote. */
function fakeRooms({ failing }: { failing?: () => boolean } = {}) {
  const docs = new Map<string, Y.Doc>()
  const editor = () => async (dayId: string, edit: (doc: Y.Doc) => unknown) => {
    if (failing?.()) throw new Error('the collaboration service is unavailable')
    const doc = docs.get(dayId) ?? new Y.Doc()
    docs.set(dayId, doc)
    edit(doc)
    return { result: undefined as never, contentVersion: 1n }
  }
  const blocksOf = (dayId: string) => {
    const blocks = docs.get(dayId)?.getMap('blocks')
    if (!blocks) return []
    return [...blocks.values()].map((block) => (block as Y.Map<unknown>).toJSON())
  }
  /** What `setDayFields` would have written, so a test can assert it did not. */
  const dayOf = (dayId: string) => docs.get(dayId)?.getMap('day').toJSON() ?? {}
  return { editor, blocksOf, dayOf, dayIds: () => [...docs.keys()] }
}

beforeAll(async () => {
  await ops.connect()
  for (const tenantId of TENANTS) {
    await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
      tenantId,
      `t-${tenantId.slice(0, 8)}`,
      'Übernahmetest',
    ])
    const identityId = randomUUID()
    const memberId = randomUUID()
    identities.push(identityId)
    members[tenantId] = memberId
    await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
      identityId,
      `a-${identityId}@example.test`,
      'active',
    ])
    await ops.query(
      `insert into member (id, tenant_id, identity_id, role, status)
       values ($1, $2, $3, 'admin', 'active')`,
      [memberId, tenantId, identityId],
    )
    await withTenant(as(tenantId), (tx) => seedBuiltinModuleTypes(tx, tenantId))
  }
})

afterAll(async () => {
  for (const tenantId of TENANTS) {
    await ops.query('delete from workshop where tenant_id = $1', [tenantId])
    await ops.query('delete from module_type where tenant_id = $1', [tenantId])
    await ops.query('delete from member where tenant_id = $1', [tenantId])
    await ops.query('delete from tenant where id = $1', [tenantId])
  }
  await ops.query('delete from identity where id = any($1)', [identities])
  await ops.end()
})

describe('adopting a design', () => {
  it('creates the workshop in the adopting tenant, and nowhere else', async () => {
    const [a, b] = TENANTS as [string, string]
    const rooms = fakeRooms()
    const result = await adoptDesign(as(a), rooms.editor, {
      designId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'new' },
    })

    const owner = await ops.query('select tenant_id from workshop where id = $1', [
      result.workshopId,
    ])
    expect(owner.rows.map((row) => row.tenant_id)).toEqual([a])

    // Not "forbidden" -- simply not there, which is what makes a leak
    // impossible rather than merely unlikely.
    const seenByB = await withTenant(as(b), (tx) =>
      tx.execute(`select id from workshop where id = '${result.workshopId}'`),
    )
    expect((seenByB as unknown as { rows: unknown[] }).rows).toHaveLength(0)
  })

  it('names the workshop after the design when nobody names it', async () => {
    const rooms = fakeRooms()
    const result = await adoptDesign(as(TENANTS[0]!), rooms.editor, {
      designId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'new' },
    })
    const { rows } = await ops.query('select title from workshop where id = $1', [
      result.workshopId,
    ])
    expect(rows[0].title).toBe('Strategietag')
  })

  it('resolves block types per tenant, by key and never by id', async () => {
    // THE assertion. Two workspaces adopt the same design: the ids they write
    // must be disjoint, and the keys behind them identical. A cached id, or one
    // carried over from the catalogue, passes every other test in this file.
    const typeIds: Record<string, string[]> = {}
    for (const tenantId of TENANTS) {
      const rooms = fakeRooms()
      await adoptDesign(as(tenantId), rooms.editor, {
        designId: CATALOGUE.id,
        locale: 'de',
        target: { kind: 'new' },
      })
      typeIds[tenantId] = rooms
        .dayIds()
        .flatMap((dayId) => rooms.blocksOf(dayId))
        .map((block) => (block as { moduleTypeId?: string }).moduleTypeId)
        .filter((id): id is string => typeof id === 'string')
    }

    const [a, b] = TENANTS as [string, string]
    expect(typeIds[a]!.length).toBeGreaterThan(0)
    expect(typeIds[a]!.some((id) => typeIds[b]!.includes(id))).toBe(false)

    const keysOf = async (ids: string[]) => {
      const { rows } = await ops.query(
        'select key from module_type where id = any($1) order by key',
        [ids],
      )
      return rows.map((row) => row.key)
    }
    expect(await keysOf(typeIds[a]!)).toEqual(await keysOf(typeIds[b]!))
  })

  it('lets an unknown method arrive as a note rather than losing the design', async () => {
    // The opposite of apply_agenda, on purpose: there the caller can fix its
    // input, here the caller cannot fix the catalogue.
    const rooms = fakeRooms()
    const result = await adoptDesign(as(TENANTS[0]!), rooms.editor, {
      designId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'new' },
    })
    expect(result.degraded).toBe(1)
    expect(result.written).toBe(2)

    const { rows } = await ops.query(
      `select id from module_type where tenant_id = $1 and key = 'note'`,
      [TENANTS[0]],
    )
    const written = rooms.dayIds().flatMap((dayId) => rooms.blocksOf(dayId))
    const degraded = written.find(
      (block) => (block as { title?: string }).title === 'Etwas Erfundenes',
    )
    expect((degraded as { moduleTypeId?: string }).moduleTypeId).toBe(rows[0].id)
  })

  it('appends days to a workshop that already has some', async () => {
    const rooms = fakeRooms()
    const first = await adoptDesign(as(TENANTS[0]!), rooms.editor, {
      designId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'new' },
    })
    const before = await ops.query(
      'select id from workshop_day where workshop_id = $1 order by position',
      [first.workshopId],
    )

    const again = fakeRooms()
    const second = await adoptDesign(as(TENANTS[0]!), again.editor, {
      designId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'append', workshopId: first.workshopId },
    })
    expect(second.workshopId).toBe(first.workshopId)

    const after = await ops.query(
      'select id from workshop_day where workshop_id = $1 order by position',
      [first.workshopId],
    )
    // The days that were there are untouched and still first.
    expect(after.rows.slice(0, before.rows.length).map((r) => r.id)).toEqual(
      before.rows.map((r) => r.id),
    )
    expect(after.rows).toHaveLength(before.rows.length + CATALOGUE.days.length)
  })
})

/**
 * A method is one block going into a day somebody already owns, and that is a
 * different set of hazards from a design, which only ever writes into days it
 * created moments earlier.
 */
describe('adopting a method', () => {
  /** A workshop with one day, made the way the app makes one. */
  async function aWorkshop(tenantId: string) {
    const rooms = fakeRooms()
    const result = await adoptDesign(as(tenantId), rooms.editor, {
      designId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'new' },
    })
    return { workshopId: result.workshopId, dayId: result.dayIds[0]! }
  }

  it('puts the block at the end of the day it was given', async () => {
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    const result = await adoptMethod(as(tenantId), rooms.editor, {
      methodId: METHOD.id,
      locale: 'de',
      target: { kind: 'day', workshopId, dayId },
    })

    expect(result).toMatchObject({ workshopId, dayId, degraded: 0, descDropped: 0 })
    const [block] = rooms.blocksOf(dayId)
    expect(block).toMatchObject({ title: 'Check-in', durationMinutes: 15, parentId: null })
  })

  it('leaves the day it was given exactly as it found it', async () => {
    // THE assertion of this block. `adoptDesign` sets the day's title and
    // start minute, which is harmless for a day it created seconds ago and
    // destructive for one somebody is using: pins resolve against their own
    // day's start, so moving it makes every pinned block jump while the rest
    // stand still.
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    await adoptMethod(as(tenantId), rooms.editor, {
      methodId: METHOD.id,
      locale: 'de',
      target: { kind: 'day', workshopId, dayId },
    })

    expect(rooms.dayOf(dayId)).toEqual({})
  })

  it('carries the prose a method actually has', async () => {
    // The library's methods have an empty `body` and their prose in `summary`.
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    await adoptMethod(as(tenantId), rooms.editor, {
      methodId: METHOD.id,
      locale: 'de',
      target: { kind: 'day', workshopId, dayId },
    })

    const [block] = rooms.blocksOf(dayId)
    expect(JSON.stringify(block)).toContain('Alle kommen einmal zu Wort.')
  })

  it('resolves the block type per tenant, by key and never by id', async () => {
    const written: Record<string, string> = {}
    for (const tenantId of TENANTS) {
      const { workshopId, dayId } = await aWorkshop(tenantId)
      const rooms = fakeRooms()
      await adoptMethod(as(tenantId), rooms.editor, {
        methodId: METHOD.id,
        locale: 'de',
        target: { kind: 'day', workshopId, dayId },
      })
      written[tenantId] = String(rooms.blocksOf(dayId)[0]?.moduleTypeId)
    }

    expect(written[TENANTS[0]!]).not.toBe(written[TENANTS[1]!])
    const { rows } = await ops.query<{ key: string }>(
      'select distinct key from module_type where id = any($1)',
      [Object.values(written)],
    )
    expect(rows.map((row) => row.key)).toEqual(['check_in'])
  })

  it('lets a method whose block type is unknown here arrive as a note', async () => {
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    const result = await adoptMethod(as(tenantId), rooms.editor, {
      methodId: ODD_METHOD.id,
      locale: 'de',
      target: { kind: 'day', workshopId, dayId },
    })

    expect(result.degraded).toBe(1)
    const { rows } = await ops.query<{ key: string }>('select key from module_type where id = $1', [
      rooms.blocksOf(dayId)[0]?.moduleTypeId,
    ])
    expect(rows[0]?.key).toBe('note')
  })

  it('refuses a day belonging to another workshop, as a missing day', async () => {
    // Without the check the room is the only gate left, and it refuses a
    // foreign day as an UNAVAILABLE SERVICE -- so the person is told the
    // collaboration server is down when they picked the wrong day.
    const tenantId = TENANTS[0]!
    const mine = await aWorkshop(tenantId)
    const other = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    await expect(
      adoptMethod(as(tenantId), rooms.editor, {
        methodId: METHOD.id,
        locale: 'de',
        target: { kind: 'day', workshopId: mine.workshopId, dayId: other.dayId },
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses a workshop in another tenant', async () => {
    const theirs = await aWorkshop(TENANTS[1]!)
    const rooms = fakeRooms()

    await expect(
      adoptMethod(as(TENANTS[0]!), rooms.editor, {
        methodId: METHOD.id,
        locale: 'de',
        target: { kind: 'day', workshopId: theirs.workshopId, dayId: theirs.dayId },
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses a method that is not there', async () => {
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    await expect(
      adoptMethod(as(tenantId), rooms.editor, {
        methodId: randomUUID(),
        locale: 'de',
        target: { kind: 'day', workshopId, dayId },
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('lets a failure in the room through instead of reporting success', async () => {
    // A design counts a failed day and carries on, because the other days did
    // arrive. One block has no other days: swallowing it would hand back a
    // success with nothing written, and the panel would offer to open a
    // workshop where nothing happened.
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms({ failing: () => true })

    await expect(
      adoptMethod(as(tenantId), rooms.editor, {
        methodId: METHOD.id,
        locale: 'de',
        target: { kind: 'day', workshopId, dayId },
      }),
    ).rejects.toThrow()
  })

  it('can make a workshop of its own for somebody who has none', async () => {
    const tenantId = TENANTS[0]!
    const rooms = fakeRooms()

    const result = await adoptMethod(as(tenantId), rooms.editor, {
      methodId: METHOD.id,
      locale: 'de',
      target: { kind: 'new' },
    })

    const { rows } = await ops.query<{ title: string }>(
      'select title from workshop where id = $1',
      [result.workshopId],
    )
    expect(rows[0]?.title).toBe('Check-in')
    expect(rooms.blocksOf(result.dayId)).toHaveLength(1)
  })
})
