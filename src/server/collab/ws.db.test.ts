import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blocksOf } from '@/domain/collab/doc'
import type { Actor } from '@/server/db'
import { Room, type Connection } from './room'
import { startCollabServer } from './ws'

/**
 * Two browsers, one day.
 *
 * The whole point of the feature, end to end: two sockets connect, one types,
 * the other sees it, and what they agreed on is in Postgres afterwards.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const PORT = 3901
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let server: { close: () => Promise<void> }
let identityId: string
let memberId: string
let workshopId: string
let dayId: string
let cookie: string
let moduleTypeId: string

// A second member with a workshop of their own, so the cross-workshop attack
// below has a real victim rather than a hypothetical one.
let victimIdentityId: string
let victimMemberId: string
let victimWorkshopId: string
let victimDayId: string
let victimCookie: string

beforeAll(async () => {
  await ops.connect()

  identityId = randomUUID()
  memberId = randomUUID()
  workshopId = uuidv7()
  dayId = uuidv7()

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `ws-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Live', $3, 'a0')`,
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

  // A session row created directly: the cookie format is the contract under
  // test here, not the login flow, which has its own tests.
  const sessionId = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  await ops.query(
    `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at)
     values ($1, $2, $3, $4, 'magic_link', now() + interval '1 hour')`,
    [sessionId, identityId, TENANT, createHash('sha256').update(secret).digest('hex')],
  )
  cookie = `gw_session=${sessionId}.${secret}`

  // The victim: same tenant, own workshop, own day. Nothing connects them to
  // the member above.
  victimIdentityId = randomUUID()
  victimMemberId = randomUUID()
  victimWorkshopId = uuidv7()
  victimDayId = uuidv7()

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    victimIdentityId,
    `victim-${victimIdentityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [victimMemberId, TENANT, victimIdentityId],
  )
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Fremd', $3, 'a1')`,
    [victimWorkshopId, TENANT, victimMemberId],
  )
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
    [victimDayId, TENANT, victimWorkshopId],
  )

  const victimSessionId = randomUUID()
  const victimSecret = randomBytes(32).toString('base64url')
  await ops.query(
    `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at)
     values ($1, $2, $3, $4, 'magic_link', now() + interval '1 hour')`,
    [
      victimSessionId,
      victimIdentityId,
      TENANT,
      createHash('sha256').update(victimSecret).digest('hex'),
    ],
  )
  victimCookie = `gw_session=${victimSessionId}.${victimSecret}`

  // Short timings: the production grace period is thirty seconds, which would
  // make these behaviours untestable in practice and therefore untested.
  server = startCollabServer({
    port: PORT,
    host: '127.0.0.1',
    timings: { persistDebounceMs: 50, materializeDebounceMs: 200, emptyGraceMs: 200 },
  })
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Seed the victim's day through the real socket, as its owner. This matters:
  // `Room.load()` only reaches its access check for an UNSEEDED day. A day that
  // has been opened once takes the early return -- which is the state every
  // real workshop is in, and the state the attack below needs.
  const victim = await connect(
    { cookie: victimCookie },
    { workshop: victimWorkshopId, day: victimDayId },
  )
  addBlock(victim.doc, uuidv7(), 'Vertraulich', 'a0')
  await new Promise((resolve) => setTimeout(resolve, 400))
  victim.close()
  await new Promise((resolve) => setTimeout(resolve, 400))
})

afterAll(async () => {
  await server.close()
  await ops.query('delete from workshop where owner_id = any($1::uuid[])', [
    [memberId, victimMemberId],
  ])
  await ops.query('delete from identity where id = any($1::uuid[])', [
    [identityId, victimIdentityId],
  ])
  await ops.end()
})

const MESSAGE_SYNC = 0

/** A minimal y-websocket client: enough protocol to sync, nothing more. */
async function connect(
  headers: Record<string, string> = { cookie },
  target: { workshop?: string; day?: string } = {},
) {
  const doc = new Y.Doc()
  const ws = new WebSocket(
    `ws://127.0.0.1:${PORT}/collab?workshop=${target.workshop ?? workshopId}&day=${target.day ?? dayId}`,
    { headers },
  )

  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)))
  })

  // Step one from the client too. The server announces what it has; without
  // this the client never asks for it, and a late joiner sees an empty day.
  {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, doc)
    ws.send(encoding.toUint8Array(encoder))
  }

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

  return { doc, ws, close: () => ws.close() }
}

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))

function addBlock(doc: Y.Doc, id: string, title: string, position: string) {
  const block = new Y.Map<unknown>()
  block.set('kind', 'module')
  block.set('position', position)
  block.set('parentId', null)
  block.set('title', title)
  block.set('moduleTypeId', moduleTypeId)
  block.set('durationMinutes', 15)
  blocksOf(doc).set(id, block)
}

describe('the collaboration socket', () => {
  it('refuses a connection without a session', async () => {
    await expect(connect({})).rejects.toThrow(/401/)
  })

  it('refuses a session that has no access to this workshop', async () => {
    const strangerIdentity = randomUUID()
    const strangerMember = randomUUID()
    const sessionId = randomUUID()
    const secret = randomBytes(32).toString('base64url')

    await ops.query('insert into identity (id, email) values ($1, $2)', [
      strangerIdentity,
      `stranger-${strangerIdentity}@example.test`,
    ])
    await ops.query(
      `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
      [strangerMember, TENANT, strangerIdentity],
    )
    await ops.query(
      `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at)
       values ($1, $2, $3, $4, 'magic_link', now() + interval '1 hour')`,
      [sessionId, strangerIdentity, TENANT, createHash('sha256').update(secret).digest('hex')],
    )

    // Same tenant, no relationship to this workshop: RLS lets them see the
    // tenant, the capability check is what stops them here.
    await expect(connect({ cookie: `gw_session=${sessionId}.${secret}` })).rejects.toThrow(/401/)

    await ops.query('delete from identity where id = $1', [strangerIdentity])
  })

  it('refuses a socket that pairs its own workshop with a foreign day', async () => {
    // The test above proves the workshop is checked. Nothing proved that the
    // DAY belongs to it -- and it is the day that decides which document gets
    // loaded and, on the way back, materialised.
    //
    // Owning any workshop is not a privilege: every member may create one. So
    // this pairing is available to everyone in the tenant who has ever seen a
    // foreign day id -- a viewer, a former collaborator, anyone with an export.
    await expect(connect({ cookie }, { workshop: workshopId, day: victimDayId })).rejects.toThrow(
      /401/,
    )
  })

  it('does not hand a foreign day’s content to a socket that asks for it', async () => {
    // Separate from the rejection above on purpose: if the guard is ever
    // loosened to "log and continue", the connection would succeed and only
    // this assertion would catch that the content still crossed.
    const attacker = await connect({ cookie }, { workshop: workshopId, day: victimDayId }).catch(
      () => null,
    )
    if (!attacker) return // refused, which is the point

    await settle()
    const titles = [...blocksOf(attacker.doc).values()].map((b) => b.get('title'))
    attacker.close()

    expect(titles).not.toContain('Vertraulich')
  })

  it('refuses an upgrade from a foreign origin', async () => {
    // Today a cross-site handshake fails anyway, because the session cookie is
    // SameSite=Lax and a WebSocket handshake is not a top-level navigation. So
    // this is not currently exploitable -- it is a defence that exists as a
    // side effect of a line in another file, with no test and no comment here
    // saying so. Change `sameSite` and it becomes cross-site WebSocket
    // hijacking, with nothing to catch it.
    await expect(connect({ cookie, origin: 'https://evil.example' })).rejects.toThrow(/40[13]/)
  })

  it('accepts an upgrade from its own origin', async () => {
    // The guard has to let the real application in, including the case where
    // there is no Origin header at all -- non-browser clients do not send one,
    // and the MCP path is exactly that.
    const own = await connect({ cookie, origin: 'http://localhost:3000' })
    own.close()
  })

  it('closes a socket that sends an oversized frame', async () => {
    // `new WebSocketServer({ noServer: true })` leaves maxPayload at the ws
    // default of 100 MiB, and every frame is applied and then buffered towards
    // a bytea column. One authenticated editor can fill memory and disk.
    const client = await connect()
    const closed = new Promise<'closed'>((resolve) =>
      client.ws.once('close', () => resolve('closed')),
    )
    // Raced rather than awaited: without a limit nothing ever closes, and a
    // test that proves that by running into the suite timeout reports the
    // wrong thing and costs twenty seconds doing it.
    const timeout = new Promise<'still open'>((resolve) =>
      setTimeout(() => resolve('still open'), 2000),
    )

    client.ws.send(Buffer.alloc(2 * 1024 * 1024, 1))

    await expect(Promise.race([closed, timeout])).resolves.toBe('closed')
    client.close()
  })

  it('carries one client’s change to the other', async () => {
    const a = await connect()
    const b = await connect()
    await settle()

    const blockId = uuidv7()
    addBlock(a.doc, blockId, 'Von A angelegt', 'a0')
    await settle()

    expect(blocksOf(b.doc).get(blockId)?.get('title')).toBe('Von A angelegt')

    a.close()
    b.close()
  })

  it('merges edits made at the same moment', async () => {
    const a = await connect()
    const b = await connect()
    await settle()

    const blockId = uuidv7()
    addBlock(a.doc, blockId, 'Gemeinsam', 'a1')
    await settle()

    // Both change the same block, each a different field.
    blocksOf(a.doc).get(blockId)!.set('title', 'Von A umbenannt')
    blocksOf(b.doc).get(blockId)!.set('durationMinutes', 45)
    await settle()

    for (const client of [a, b]) {
      const block = blocksOf(client.doc).get(blockId)!
      expect(block.get('title')).toBe('Von A umbenannt')
      expect(block.get('durationMinutes')).toBe(45)
    }

    a.close()
    b.close()
  })

  it('hands the current state to somebody who joins late', async () => {
    const a = await connect()
    await settle()

    const blockId = uuidv7()
    addBlock(a.doc, blockId, 'Schon da', 'a2')
    await settle()

    const late = await connect()
    await settle()

    expect(blocksOf(late.doc).get(blockId)?.get('title')).toBe('Schon da')

    a.close()
    late.close()
  })

  it('writes what was agreed into the relational tables', async () => {
    const a = await connect()
    await settle()

    const blockId = uuidv7()
    addBlock(a.doc, blockId, 'Landet in Postgres', 'a3')
    a.close()

    // Closing the last connection flushes: persist, then materialise.
    await settle(1200)

    const { rows } = await ops.query('select id, title from module where day_id = $1', [dayId])
    expect(rows.map((r) => r.title)).toContain('Landet in Postgres')
  })

  it('survives a reconnect without losing anything', async () => {
    const first = await connect()
    await settle()
    const blockId = uuidv7()
    addBlock(first.doc, blockId, 'Vor dem Abriss', 'a4')
    await settle()
    first.close()

    // Reconnecting within the grace period must find the room, not replay a
    // cold log -- and either way must not lose the block.
    const again = await connect()
    await settle()

    expect(blocksOf(again.doc).get(blockId)?.get('title')).toBe('Vor dem Abriss')
    again.close()
  })
  it('does not destroy a room that somebody joined while it was being torn down', async () => {
    // Where e2e/collaboration.workshop.spec.ts flakes.
    //
    // `remove()` schedules a teardown, and `add()` cancels the TIMER -- but
    // once that timer has fired there is nothing left to cancel. `flush()` is
    // already in flight, and it ends in `doc.destroy()` and `onEmpty()`
    // unconditionally, while the room is still in the registry for anyone who
    // connects meanwhile. That client keeps an open socket to a destroyed
    // document, and the next one to arrive builds a second room. Neither ever
    // hears the other again, and nothing says so: the page reads
    // `data-save-state="live"` throughout.
    //
    // Driven against `Room` rather than through two sockets on purpose. The
    // window is opened here by holding the row lock that `materializeDay`
    // takes -- but `authenticate()` asks for `workshop.content.write`, and
    // `assertWorkshopAccess` locks the same row for a write, so a second
    // SOCKET could not be established while the window is open. Racing the
    // flush without a lock would mean proving a race with a racy test, which
    // docs/konventionen-tests.md rules out for good reason.
    const ownWorkshopId = uuidv7()
    const ownDayId = uuidv7()
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Abriss', $3, 'a9')`,
      [ownWorkshopId, TENANT, memberId],
    )
    await ops.query(
      `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
      [ownDayId, TENANT, ownWorkshopId],
    )

    const actor: Actor = {
      tenantId: TENANT,
      memberId,
      tenantRole: 'member',
      displayName: 'Abriss',
      source: 'web',
    }

    let emptied = 0
    const room = new Room(ownWorkshopId, ownDayId, actor, () => (emptied += 1), {
      persistDebounceMs: 50,
      // Long on purpose, so nothing materialises on the debounce and the
      // teardown's own flush is the first to do it. `materializeDay` returns
      // "unchanged" before it ever reaches the row lock when the tables are
      // already current -- which would close the window this test needs.
      materializeDebounceMs: 30_000,
      emptyGraceMs: 200,
    })
    await room.load()

    const socket = (): Connection => ({ send: () => {}, close: () => {} })
    const first = socket()
    room.add(first)

    // Something worth writing out, so the teardown reaches materialisation
    // instead of returning early with nothing to do.
    addBlock(room.doc, uuidv7(), 'Vor dem Abriss', 'a0')
    await settle()

    const blocker = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
    await blocker.connect()

    try {
      // Holds the flush open for as long as this transaction lives. In the e2e
      // suite the same lock is contended by every other worker's room doing
      // the same thing, which is what widens this window on a loaded machine
      // and leaves it invisible on a quiet one.
      await blocker.query('begin')
      await blocker.query('select id from workshop where id = $1 for update', [ownWorkshopId])

      room.remove(first)
      await settle(600) // grace elapses, teardown fires, flush blocks

      // Somebody opens the day again. Through the socket this is the
      // `rooms.get(key)` in attach() finding a room on its way out.
      room.add(socket())

      await blocker.query('commit')
      await settle(800) // the flush completes -- and must not take the room with it

      expect(room.doc.isDestroyed).toBe(false)
      expect(emptied).toBe(0)
    } finally {
      await blocker.query('rollback').catch(() => {})
      await blocker.end()
    }

    // Leave nothing holding the day: the room is still occupied by the joiner.
    for (const connection of [...room.connections]) room.remove(connection)
    await settle(800)
  })
})
