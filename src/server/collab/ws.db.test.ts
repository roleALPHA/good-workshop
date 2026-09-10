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

  // Short timings: the production grace period is thirty seconds, which would
  // make these behaviours untestable in practice and therefore untested.
  server = startCollabServer({
    port: PORT,
    host: '127.0.0.1',
    timings: { persistDebounceMs: 50, materializeDebounceMs: 200, emptyGraceMs: 200 },
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
})

afterAll(async () => {
  await server.close()
  await ops.query('delete from workshop where owner_id = $1', [memberId])
  await ops.query('delete from identity where id = $1', [identityId])
  await ops.end()
})

const MESSAGE_SYNC = 0

/** A minimal y-websocket client: enough protocol to sync, nothing more. */
async function connect(headers: Record<string, string> = { cookie }) {
  const doc = new Y.Doc()
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/collab?workshop=${workshopId}&day=${dayId}`, {
    headers,
  })

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
})
