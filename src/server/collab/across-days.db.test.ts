import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NotFoundError } from '@/domain/agenda/access'
import { blocksOf, seedFromDayDoc } from '@/domain/collab/doc'
import { addModuleBlock } from '@/domain/collab/ops'
import { generatePersonalAccessToken } from '@/server/auth/tokens'
import { withTenant, type Actor } from '@/server/db'
import { deleteDayKeepingParked, moveModuleToDay, parkedElsewhere, roomEditor } from './across-days'
import { appendUpdate } from './store'
import { startCollabServer } from './ws'

/**
 * The parking area belongs to the workshop, and the days are separate rooms.
 *
 * A block parked on the first day has to be reachable from the second: seen
 * there, and brought into its schedule. Each day is its own shared document,
 * written back to the tables by its own materialiser -- which deletes every row
 * of its day that its document does not hold. So the move is two edits in two
 * rooms, and the tests below are about that seam: nothing lost, nothing left
 * behind, and nothing that only works while nobody is looking.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const PORT = 3905
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let server: { close: () => Promise<void> }
let identityId: string
let memberId: string
let moduleTypeId: string
let token: string
let cookie: string

let workshopId: string
let firstDay: string
let secondDay: string

const url = `ws://127.0.0.1:${PORT}/collab`
const actor = (): Actor => ({ tenantId: TENANT, memberId, tenantRole: 'member', source: 'web' })

beforeAll(async () => {
  await ops.connect()

  identityId = randomUUID()
  memberId = randomUUID()
  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `days-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )

  const types = await ops.query(
    `select id from module_type where tenant_id = $1 and key = 'break'`,
    [TENANT],
  )
  moduleTypeId = types.rows[0].id

  const pat = generatePersonalAccessToken()
  token = pat.token
  await ops.query(
    `insert into personal_access_token (id, tenant_id, member_id, name, token_id, token_hash, scopes)
     values ($1, $2, $3, 'Test', $4, $5, '{workshops:read,workshops:write}')`,
    [randomUUID(), TENANT, memberId, pat.tokenId, pat.tokenHash],
  )

  const sessionId = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  await ops.query(
    `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at)
     values ($1, $2, $3, $4, 'magic_link', now() + interval '1 hour')`,
    [sessionId, identityId, TENANT, createHash('sha256').update(secret).digest('hex')],
  )
  cookie = `gw_session=${sessionId}.${secret}`

  server = startCollabServer({
    port: PORT,
    host: '127.0.0.1',
    timings: { persistDebounceMs: 50, materializeDebounceMs: 200, emptyGraceMs: 200 },
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
})

afterAll(async () => {
  await server.close()
  await ops.query('delete from personal_access_token where member_id = $1', [memberId])
  await ops.query('delete from workshop where owner_id = $1', [memberId])
  await ops.query('delete from identity where id = $1', [identityId])
  await ops.end()
})

beforeEach(async () => {
  workshopId = uuidv7()
  firstDay = uuidv7()
  secondDay = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Zwei Tage', $3, 'a0')`,
    [workshopId, TENANT, memberId],
  )
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, title, position)
     values ($1, $2, $3, 'Tag 1', 'a0'), ($4, $2, $3, 'Tag 2', 'a1')`,
    [firstDay, TENANT, workshopId, secondDay],
  )
})

const asModel = () => roomEditor({ workshopId, authorization: `Bearer ${token}`, url })
const asPerson = () => roomEditor({ workshopId, cookie, url })

const insertModule = async (
  dayId: string,
  title: string,
  options: { parked?: boolean; position?: string; durationMinutes?: number } = {},
) => {
  const id = uuidv7()
  await ops.query(
    `insert into module (id, tenant_id, workshop_id, day_id, module_type_id, title, duration_minutes, position, parked)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      TENANT,
      workshopId,
      dayId,
      moduleTypeId,
      title,
      options.durationMinutes ?? 30,
      options.position ?? 'a0',
      options.parked ?? false,
    ],
  )
  return id
}

const modulesOn = async (dayId: string) => {
  const { rows } = await ops.query(
    'select id, title, duration_minutes, parked from module where day_id = $1 order by position, id',
    [dayId],
  )
  return rows as { id: string; title: string; duration_minutes: number; parked: boolean }[]
}

describe('a parked block brought to another day', () => {
  it('leaves the day it was parked on and lands in the schedule of the other', async () => {
    await insertModule(secondDay, 'Schon da', { position: 'a0' })
    const parked = await insertModule(firstDay, 'Plan B', { parked: true, durationMinutes: 45 })

    const moved = await moveModuleToDay(asModel(), {
      moduleId: parked,
      fromDayId: firstDay,
      toDayId: secondDay,
      parked: false,
    })

    expect(await modulesOn(firstDay)).toEqual([])
    expect(await modulesOn(secondDay)).toEqual([
      expect.objectContaining({ title: 'Schon da' }),
      // At the end of the day it came to, and counting towards its clock.
      { id: moved.moduleId, title: 'Plan B', duration_minutes: 45, parked: false },
    ])
  })

  it('stays parked when nobody asked to bring it into the schedule', async () => {
    const parked = await insertModule(firstDay, 'Reserve', { parked: true })

    await moveModuleToDay(asModel(), { moduleId: parked, fromDayId: firstDay, toDayId: secondDay })

    expect(await modulesOn(secondDay)).toEqual([
      expect.objectContaining({ title: 'Reserve', parked: true }),
    ])
  })

  it('arrives in front of somebody who has that day open, moved by a signed-in person', async () => {
    // The cookie path is the one the day editor uses: a server action acting
    // for the person in the browser, not a token.
    const parked = await insertModule(firstDay, 'Energizer', { parked: true })
    const human = await connectAsHuman(secondDay)
    await settle()

    await moveModuleToDay(asPerson(), {
      moduleId: parked,
      fromDayId: firstDay,
      toDayId: secondDay,
      parked: false,
    })
    await settle()

    const seen = [...blocksOf(human.doc).values()].map((block) => block.get('title'))
    expect(seen).toContain('Energizer')
    human.close()

    // And it is not deleted again by the room that person was sitting in.
    await settle(600)
    expect((await modulesOn(secondDay)).map((m) => m.title)).toEqual(['Energizer'])
  })

  it('refuses a block that is not on the day it names, and changes nothing', async () => {
    const elsewhere = await insertModule(secondDay, 'Woanders', { parked: true })

    await expect(
      moveModuleToDay(asModel(), { moduleId: elsewhere, fromDayId: firstDay, toDayId: secondDay }),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(await modulesOn(secondDay)).toEqual([
      expect.objectContaining({ id: elsewhere, title: 'Woanders', parked: true }),
    ])
  })
})

describe('the parking area of a workshop', () => {
  it('holds what is parked on the other days, including what the tables have not caught up with', async () => {
    // Parked in the shared document a moment ago: the log has it, the tables
    // do not yet. Somebody who parks a block and switches day at once must
    // still find it on the shelf.
    const doc = new Y.Doc()
    seedFromDayDoc(doc, {
      id: secondDay,
      workshopId,
      title: 'Tag 2',
      date: null,
      startMinute: 540,
      targetEndMinute: null,
      desc: {},
      clusters: [],
      modules: [],
      moduleTypes: {},
    })
    addModuleBlock(doc, uuidv7(), {
      moduleTypeId,
      title: 'Frisch geparkt',
      durationMinutes: 20,
      parked: true,
    })
    addModuleBlock(doc, uuidv7(), { moduleTypeId, title: 'Im Ablauf', durationMinutes: 20 })
    await withTenant(actor(), (tx) => appendUpdate(tx, secondDay, Y.encodeStateAsUpdate(doc)))

    // A day nobody has opened yet has no document at all -- only rows.
    const thirdDay = uuidv7()
    await ops.query(
      `insert into workshop_day (id, tenant_id, workshop_id, title, position) values ($1, $2, $3, 'Tag 3', 'a2')`,
      [thirdDay, TENANT, workshopId],
    )
    await insertModule(thirdDay, 'Aus der Tabelle', { parked: true, durationMinutes: 15 })
    await insertModule(firstDay, 'Auf diesem Tag', { parked: true })

    const shelf = await withTenant(actor(), (tx) => parkedElsewhere(tx, workshopId, firstDay))

    expect(shelf.map((block) => [block.title, block.dayId, block.durationMinutes])).toEqual([
      ['Frisch geparkt', secondDay, 20],
      ['Aus der Tabelle', thirdDay, 15],
    ])
  })
})

describe('deleting a day', () => {
  it('keeps its parked blocks, on a day that stays', async () => {
    await insertModule(secondDay, 'Geht mit dem Tag', { position: 'a0' })
    await insertModule(secondDay, 'Bleibt auf dem Parkplatz', { parked: true, position: 'a1' })

    const result = await deleteDayKeepingParked(actor(), asModel(), {
      workshopId,
      dayId: secondDay,
    })

    expect(result).toMatchObject({ rescued: 1, remainingDayId: firstDay })
    const days = await ops.query('select id from workshop_day where workshop_id = $1', [workshopId])
    expect(days.rows.map((row: { id: string }) => row.id)).toEqual([firstDay])
    expect(await modulesOn(firstDay)).toEqual([
      expect.objectContaining({ title: 'Bleibt auf dem Parkplatz', parked: true }),
    ])
  })

  it('still refuses the last day, before it touches anything', async () => {
    await ops.query('delete from workshop_day where id = $1', [secondDay])
    await insertModule(firstDay, 'Bleibt', { parked: true })

    await expect(
      deleteDayKeepingParked(actor(), asModel(), { workshopId, dayId: firstDay }),
    ).rejects.toThrow('workshop.lastDay')
    expect((await modulesOn(firstDay)).map((m) => m.title)).toEqual(['Bleibt'])
  })
})

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))
const MESSAGE_SYNC = 0

/** A browser with a day open, as far as the server is concerned. */
async function connectAsHuman(dayId: string) {
  const doc = new Y.Doc()
  const ws = new WebSocket(`${url}?workshop=${workshopId}&day=${dayId}`, { headers: { cookie } })

  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })

  ws.on('message', (data: Buffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data))
    if (decoding.readVarUint(decoder) !== MESSAGE_SYNC) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.readSyncMessage(decoder, encoder, doc, 'remote')
    if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder))
  })

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    ws.send(encoding.toUint8Array(encoder))
  })

  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, doc)
  ws.send(encoding.toUint8Array(encoder))

  return { doc, close: () => ws.close() }
}
