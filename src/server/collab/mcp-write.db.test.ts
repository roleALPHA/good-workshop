import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blocksOf } from '@/domain/collab/doc'
import { addModuleBlock } from '@/domain/collab/ops'
import { generatePersonalAccessToken } from '@/server/auth/tokens'
import { editInRoom } from './client'
import { Room } from './room'
import { startCollabServer } from './ws'

/**
 * An LLM as a collaborator.
 *
 * This file exists because of a real data-loss bug: MCP writes went straight
 * to the relational tables, while the materialiser wrote the CRDT back over
 * them and deleted everything it did not hold. A block a model added while
 * somebody had the day open disappeared a few seconds later, silently. The
 * two tests below are that bug, from both directions -- a model writing to a
 * day nobody has opened, and a model writing to a day somebody is editing.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const PORT = 3903
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let server: { close: () => Promise<void> }
let identityId: string
let memberId: string
let workshopId: string
let dayId: string
let moduleTypeId: string
let token: string
let cookie: string

beforeAll(async () => {
  await ops.connect()

  identityId = randomUUID()
  memberId = randomUUID()
  workshopId = uuidv7()
  dayId = uuidv7()

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `mcp-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'MCP', $3, 'a0')`,
    [workshopId, TENANT, memberId],
  )
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
    [dayId, TENANT, workshopId],
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

const url = `ws://127.0.0.1:${PORT}/collab`
const target = () => ({ workshopId, dayId, authorization: `Bearer ${token}`, url })

const titles = async () => {
  const rows = await ops.query('select title from module where day_id = $1 order by position, id', [
    dayId,
  ])
  return rows.rows.map((row: { title: string }) => row.title)
}

const insertModule = (title: string, position: string) =>
  ops.query(
    `insert into module (id, tenant_id, workshop_id, day_id, module_type_id, title, duration_minutes, position)
     values ($1, $2, $3, $4, $5, $6, 30, $7)`,
    [uuidv7(), TENANT, workshopId, dayId, moduleTypeId, title, position],
  )

describe('an MCP write', () => {
  it('keeps the blocks that were already there', async () => {
    // The day exists in the tables and has never been opened by anyone, so it
    // has no CRDT state. A model writing into it used to start from an empty
    // document -- and the materialiser then deleted the day.
    await insertModule('Vorher da', 'a0')

    const { contentVersion } = await editInRoom(target(), (doc) =>
      addModuleBlock(doc, uuidv7(), {
        moduleTypeId,
        title: 'Vom Modell ergänzt',
        durationMinutes: 20,
      }),
    )

    expect(await titles()).toEqual(['Vorher da', 'Vom Modell ergänzt'])
    expect(contentVersion).toBeGreaterThan(0n)
  })

  it('does not delete what a person adds while it writes', async () => {
    const human = await connectAsHuman()
    await settle()

    const humanBlock = uuidv7()
    addModuleBlock(human.doc, humanBlock, {
      moduleTypeId,
      title: 'Von Hand',
      durationMinutes: 10,
    })
    await settle()

    await editInRoom(target(), (doc) =>
      addModuleBlock(doc, uuidv7(), { moduleTypeId, title: 'Vom Modell', durationMinutes: 10 }),
    )

    // Both writes reached the same document, so both are in the tables -- and
    // the person sees the model's block without reloading.
    const written = await titles()
    expect(written).toContain('Von Hand')
    expect(written).toContain('Vom Modell')

    await settle()
    const seenByHuman = [...blocksOf(human.doc).values()].map((block) => block.get('title'))
    expect(seenByHuman).toContain('Vom Modell')

    human.close()
  })

  it('refuses a day that belongs to a different workshop', async () => {
    // The MCP half of the same hole as the socket: preflight authorises
    // workshopId, inRoom opens (workshopId, dayId), and nothing establishes
    // that the day is part of that workshop.
    //
    // With `apply_agenda` in replace mode this is one call: a token scoped to
    // a workshop the caller legitimately owns, pointed at somebody else's day,
    // clears it. A read-only token is not required and a viewer relationship
    // is not required -- only the id.
    const strangerIdentity = randomUUID()
    const strangerMember = randomUUID()
    const strangerWorkshop = uuidv7()
    const strangerDay = uuidv7()

    await ops.query('insert into identity (id, email) values ($1, $2)', [
      strangerIdentity,
      `mcp-stranger-${strangerIdentity}@example.test`,
    ])
    await ops.query(
      `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
      [strangerMember, TENANT, strangerIdentity],
    )
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Fremd', $3, 'a3')`,
      [strangerWorkshop, TENANT, strangerMember],
    )
    await ops.query(
      `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
      [strangerDay, TENANT, strangerWorkshop],
    )
    await ops.query(
      `insert into module (id, tenant_id, workshop_id, day_id, module_type_id, title, duration_minutes, position)
       values ($1, $2, $3, $4, $5, 'Fremder Inhalt', 30, 'a0')`,
      [uuidv7(), TENANT, strangerWorkshop, strangerDay, moduleTypeId],
    )

    // Seed the stranger's day as its own owner. Without this the test passes
    // for the wrong reason: an UNSEEDED day still runs through Room.load()'s
    // access check, which does bind day to workshop, so the attack is refused
    // by the one path that was never the problem. The hole is the early return
    // taken by every day that has been opened once.
    const strangerToken = generatePersonalAccessToken()
    await ops.query(
      `insert into personal_access_token (id, tenant_id, member_id, name, token_id, token_hash, scopes)
       values ($1, $2, $3, 'Fremd', $4, $5, '{workshops:read,workshops:write}')`,
      [randomUUID(), TENANT, strangerMember, strangerToken.tokenId, strangerToken.tokenHash],
    )
    await editInRoom(
      {
        workshopId: strangerWorkshop,
        dayId: strangerDay,
        authorization: `Bearer ${strangerToken.token}`,
        url,
      },
      (doc) =>
        addModuleBlock(doc, uuidv7(), {
          moduleTypeId,
          title: 'Vom Eigentümer',
          durationMinutes: 10,
        }),
    )

    await expect(
      editInRoom({ workshopId, dayId: strangerDay, authorization: `Bearer ${token}`, url }, (doc) =>
        addModuleBlock(doc, uuidv7(), {
          moduleTypeId,
          title: 'Untergeschoben',
          durationMinutes: 10,
        }),
      ),
    ).rejects.toThrow()

    const { rows } = await ops.query(
      'select title from module where day_id = $1 order by position',
      [strangerDay],
    )
    expect(rows.map((r: { title: string }) => r.title)).not.toContain('Untergeschoben')
    expect(rows.map((r: { title: string }) => r.title)).toContain('Fremder Inhalt')

    await ops.query('delete from personal_access_token where member_id = $1', [strangerMember])
    await ops.query('delete from workshop where owner_id = $1', [strangerMember])
    await ops.query('delete from identity where id = $1', [strangerIdentity])
  })

  it('refuses a token that cannot write', async () => {
    const readOnly = generatePersonalAccessToken()
    await ops.query(
      `insert into personal_access_token (id, tenant_id, member_id, name, token_id, token_hash, scopes)
       values ($1, $2, $3, 'Nur lesen', $4, $5, '{workshops:read}')`,
      [randomUUID(), TENANT, memberId, readOnly.tokenId, readOnly.tokenHash],
    )

    await expect(
      editInRoom({ ...target(), authorization: `Bearer ${readOnly.token}` }, () => undefined),
    ).rejects.toThrow('collab.unavailable')
  })
})

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))
const MESSAGE_SYNC = 0

/** A browser, as far as the server is concerned. */
async function connectAsHuman() {
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

describe('a room whose materialisation is quicker than its persist', () => {
  it('still writes the day out', async () => {
    // The race that produced an export of a completely EMPTY day while the
    // editor showed a full one. Materialising reads the log back out of the
    // database; one that overtakes its own append finds nothing new, reports
    // "unchanged" and schedules nothing more, so the tables stay behind until
    // the room closes -- which for a day somebody is still looking at is never.
    //
    // The timings are inverted on purpose: persist last, materialise first.
    // With a real debounce this happens only under load, which is exactly the
    // kind of bug that reappears because it could not be reproduced.
    const dayId = uuidv7()
    await ops.query(
      `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a1')`,
      [dayId, TENANT, workshopId],
    )

    const actor = {
      tenantId: TENANT,
      memberId,
      tenantRole: 'member' as const,
      source: 'web' as const,
    }
    const room = new Room(workshopId, dayId, actor, () => {}, {
      persistDebounceMs: 400,
      materializeDebounceMs: 20,
      emptyGraceMs: 60_000,
    })

    await room.load()
    addModuleBlock(room.doc, uuidv7(), {
      moduleTypeId,
      title: 'Trotz Wettlauf da',
      durationMinutes: 30,
    })

    await new Promise((resolve) => setTimeout(resolve, 600))

    const rows = await ops.query('select title from module where day_id = $1', [dayId])
    expect(rows.rows.map((row: { title: string }) => row.title)).toEqual(['Trotz Wettlauf da'])
  })
})
