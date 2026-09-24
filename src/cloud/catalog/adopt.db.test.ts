import { randomUUID } from 'node:crypto'
import pg from 'pg'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { seedBuiltinModuleTypes } from '@/domain/moduleType/seed'
import type { EntryDetail } from './ports'

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
 * The room is faked. What `adoptEntry` does INSIDE a room -- and the fact
 * that a relational write there would be erased at the next materialise -- is
 * covered by src/server/collab/mcp-write.db.test.ts against a real server.
 * What is faked here is the transport, not the decision: the edit runs against
 * a real Y.Doc and the blocks it wrote are read back out of it.
 */

const CATALOGUE: EntryDetail = {
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
  slug: null,
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
              fields: {},
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
          fields: {},
        },
      ],
    },
  ],
}

/**
 * A one-day entry -- what a building block looks like: one day, one cluster,
 * the steps inside it. Its block carries authored fields, which is the thing
 * `catalog_entry_block.json_desc` exists for.
 */
const BLOCK_ENTRY: EntryDetail = {
  id: randomUUID(),
  name: 'Check-in',
  summary: 'Alle kommen einmal zu Wort.',
  body: '',
  translated: true,
  facets: [],
  minParticipants: null,
  maxParticipants: null,
  durationMinutes: 15,
  dayCount: 1,
  slug: 'check-in',
  days: [
    {
      title: '',
      startMinute: 540,
      items: [
        {
          kind: 'module',
          moduleTypeKey: 'check_in',
          title: 'Check-in',
          durationMinutes: 15,
          pinnedStartMinute: null,
          parked: false,
          description: '',
          fields: { participation: 'plenary' },
        },
      ],
    },
  ],
}

/** The same, for a block type no workspace has. */
const ODD_ENTRY: EntryDetail = {
  ...BLOCK_ENTRY,
  id: randomUUID(),
  name: 'Etwas Erfundenes',
  slug: null,
  days: [
    {
      title: '',
      startMinute: 540,
      items: [
        {
          kind: 'module',
          moduleTypeKey: 'nonesuch',
          title: 'Etwas Erfundenes',
          durationMinutes: 30,
          pinnedStartMinute: null,
          parked: false,
          description: '',
          fields: {},
        },
      ],
    },
  ],
}

const ENTRIES = new Map([
  [CATALOGUE.id, CATALOGUE],
  [BLOCK_ENTRY.id, BLOCK_ENTRY],
  [ODD_ENTRY.id, ODD_ENTRY],
])

vi.mock('@gw/catalog', () => ({
  catalog: { getEntry: async (id: string) => ENTRIES.get(id) ?? null },
}))

const { adoptEntry } = await import('./adopt')
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
    const result = await adoptEntry(as(a), rooms.editor, {
      entryId: CATALOGUE.id,
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

  it('names the workshop after the entry when nobody names it', async () => {
    const rooms = fakeRooms()
    const result = await adoptEntry(as(TENANTS[0]!), rooms.editor, {
      entryId: CATALOGUE.id,
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
      await adoptEntry(as(tenantId), rooms.editor, {
        entryId: CATALOGUE.id,
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

  it('lets an unknown block type arrive as a note rather than losing the entry', async () => {
    // The opposite of apply_agenda, on purpose: there the caller can fix its
    // input, here the caller cannot fix the catalogue.
    const rooms = fakeRooms()
    const result = await adoptEntry(as(TENANTS[0]!), rooms.editor, {
      entryId: CATALOGUE.id,
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
    const first = await adoptEntry(as(TENANTS[0]!), rooms.editor, {
      entryId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'new' },
    })
    const before = await ops.query(
      'select id from workshop_day where workshop_id = $1 order by position',
      [first.workshopId],
    )

    const again = fakeRooms()
    const second = await adoptEntry(as(TENANTS[0]!), again.editor, {
      entryId: CATALOGUE.id,
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
describe('adopting a one-day entry into a day', () => {
  /** A workshop with one day, made the way the app makes one. */
  async function aWorkshop(tenantId: string) {
    const rooms = fakeRooms()
    const result = await adoptEntry(as(tenantId), rooms.editor, {
      entryId: CATALOGUE.id,
      locale: 'de',
      target: { kind: 'new' },
    })
    return { workshopId: result.workshopId, dayId: result.dayIds[0]! }
  }

  it('puts the block at the end of the day it was given', async () => {
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    const result = await adoptEntry(as(tenantId), rooms.editor, {
      entryId: BLOCK_ENTRY.id,
      locale: 'de',
      target: { kind: 'day', workshopId, dayId },
    })

    expect(result).toMatchObject({ workshopId, dayIds: [dayId], degraded: 0, descsDropped: 0 })
    const [block] = rooms.blocksOf(dayId)
    expect(block).toMatchObject({ title: 'Check-in', durationMinutes: 15, parentId: null })
  })

  it('leaves the day it was given exactly as it found it', async () => {
    // THE assertion of this block. Adopting into a NEW day sets its title and
    // start minute, which is harmless for a day it created seconds ago and
    // destructive for one somebody is using: pins resolve against their own
    // day's start, so moving it makes every pinned block jump while the rest
    // stand still.
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    await adoptEntry(as(tenantId), rooms.editor, {
      entryId: BLOCK_ENTRY.id,
      locale: 'de',
      target: { kind: 'day', workshopId, dayId },
    })

    expect(rooms.dayOf(dayId)).toEqual({})
  })

  it('carries the authored fields into the block', async () => {
    // The point of the rebuild: a block arrives with its type's own fields
    // filled in, not with marketing prose in the one free-text field.
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    await adoptEntry(as(tenantId), rooms.editor, {
      entryId: BLOCK_ENTRY.id,
      locale: 'de',
      target: { kind: 'day', workshopId, dayId },
    })

    const [block] = rooms.blocksOf(dayId)
    expect(JSON.stringify(block)).toContain('participation')
  })

  it('resolves the block type per tenant, by key and never by id', async () => {
    const written: Record<string, string> = {}
    for (const tenantId of TENANTS) {
      const { workshopId, dayId } = await aWorkshop(tenantId)
      const rooms = fakeRooms()
      await adoptEntry(as(tenantId), rooms.editor, {
        entryId: BLOCK_ENTRY.id,
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

  it('lets a block type unknown here arrive as a note', async () => {
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    const result = await adoptEntry(as(tenantId), rooms.editor, {
      entryId: ODD_ENTRY.id,
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
      adoptEntry(as(tenantId), rooms.editor, {
        entryId: BLOCK_ENTRY.id,
        locale: 'de',
        target: { kind: 'day', workshopId: mine.workshopId, dayId: other.dayId },
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses a workshop in another tenant', async () => {
    const theirs = await aWorkshop(TENANTS[1]!)
    const rooms = fakeRooms()

    await expect(
      adoptEntry(as(TENANTS[0]!), rooms.editor, {
        entryId: BLOCK_ENTRY.id,
        locale: 'de',
        target: { kind: 'day', workshopId: theirs.workshopId, dayId: theirs.dayId },
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses an entry that is not there', async () => {
    const tenantId = TENANTS[0]!
    const { workshopId, dayId } = await aWorkshop(tenantId)
    const rooms = fakeRooms()

    await expect(
      adoptEntry(as(tenantId), rooms.editor, {
        entryId: randomUUID(),
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
      adoptEntry(as(tenantId), rooms.editor, {
        entryId: BLOCK_ENTRY.id,
        locale: 'de',
        target: { kind: 'day', workshopId, dayId },
      }),
    ).rejects.toThrow()
  })

  it('can make a workshop of its own for somebody who has none', async () => {
    const tenantId = TENANTS[0]!
    const rooms = fakeRooms()

    const result = await adoptEntry(as(tenantId), rooms.editor, {
      entryId: BLOCK_ENTRY.id,
      locale: 'de',
      target: { kind: 'new' },
    })

    const { rows } = await ops.query<{ title: string }>(
      'select title from workshop where id = $1',
      [result.workshopId],
    )
    expect(rows[0]?.title).toBe('Check-in')
    expect(rooms.blocksOf(result.dayIds[0]!)).toHaveLength(1)
  })
})
