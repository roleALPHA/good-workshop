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
import { generatePersonalAccessToken } from '@/server/auth/tokens'
import { startCollabServer, type CollabServerOptions } from './ws'

/**
 * What an open socket may keep doing after the handshake let it in.
 *
 * ws.db.test.ts is about the door. This file is about the room behind it: that
 * a credential withdrawn while the socket is open stops working then and not at
 * the next reconnect, and that a participant who is allowed in cannot make the
 * room -- or the process -- as large as they like.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

const FAST = { persistDebounceMs: 50, materializeDebounceMs: 200, emptyGraceMs: 200 }

/** Notifications on, and a revalidation interval nothing here waits for. */
const NOTIFY_PORT = 3911
/** No notifications, and every write checked before it is applied. */
const GATE_PORT = 3912
/** No notifications, and a short sweep: the fallback on its own. */
const SWEEP_PORT = 3913
/** Tight quotas. */
const LIMIT_PORT = 3914

const servers: { close: () => Promise<void> }[] = []

let ownerIdentity: string
let ownerMember: string
let ownerCookie: string
let workshopId: string
let moduleTypeId: string

beforeAll(async () => {
  await ops.connect()

  ownerIdentity = randomUUID()
  ownerMember = randomUUID()
  workshopId = uuidv7()

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    ownerIdentity,
    `guards-${ownerIdentity}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [ownerMember, TENANT, ownerIdentity],
  )
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Wache', $3, 'a0')`,
    [workshopId, TENANT, ownerMember],
  )
  ownerCookie = await sessionCookie(ownerIdentity)

  const types = await ops.query(
    `select id from module_type where tenant_id = $1 and key = 'break'`,
    [TENANT],
  )
  moduleTypeId = types.rows[0].id

  const start = (port: number, rest: Partial<CollabServerOptions>) =>
    servers.push(startCollabServer({ port, host: '127.0.0.1', timings: FAST, ...rest }))

  start(NOTIFY_PORT, { limits: { revalidateMs: 60_000 } })
  start(GATE_PORT, { limits: { revalidateMs: 0 }, notifications: false })
  start(SWEEP_PORT, { limits: { revalidateMs: 300 }, notifications: false })
  start(LIMIT_PORT, {
    limits: {
      revalidateMs: 60_000,
      messageBurst: 30,
      messagesPerSecond: 5,
      maxDocBytes: 64 * 1024,
      maxConnectionsPerRoom: 3,
    },
    notifications: false,
  })
  await settle(500)
})

afterAll(async () => {
  for (const server of servers) await server.close()
  await ops.query('delete from workshop where id = $1', [workshopId])
  await ops.query(`delete from identity where email like 'guards-%@example.test'`)
  await ops.end()
})

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))

async function newDay(): Promise<string> {
  const dayId = uuidv7()
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, $4)`,
    [dayId, TENANT, workshopId, `a${dayId.slice(-6)}`],
  )
  return dayId
}

async function sessionCookie(identityId: string): Promise<string> {
  const sessionId = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  await ops.query(
    `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at)
     values ($1, $2, $3, $4, 'magic_link', now() + interval '1 hour')`,
    [sessionId, identityId, TENANT, createHash('sha256').update(secret).digest('hex')],
  )
  return `gw_session=${sessionId}.${secret}`
}

/** A member of the tenant with nothing but what the caller grants them. */
async function colleague(): Promise<{ identityId: string; memberId: string; cookie: string }> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `guards-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
  await ops.query(
    `insert into workshop_collaborator (tenant_id, workshop_id, member_id, role) values ($1, $2, $3, 'editor')`,
    [TENANT, workshopId, memberId],
  )
  return { identityId, memberId, cookie: await sessionCookie(identityId) }
}

async function guest(): Promise<{ linkId: string; cookie: string }> {
  const linkId = randomUUID()
  const sessionId = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  await ops.query(
    `insert into workshop_share_link (id, tenant_id, workshop_id, email, token_hash, role)
     values ($1, $2, $3, $4, $5, 'editor')`,
    [
      linkId,
      TENANT,
      workshopId,
      `guest-${linkId}@example.test`,
      createHash('sha256').update(`tok-${linkId}`).digest('hex'),
    ],
  )
  await ops.query(
    `insert into share_session (id, tenant_id, share_link_id, secret_hash, expires_at)
     values ($1, $2, $3, $4, now() + interval '1 hour')`,
    [sessionId, TENANT, linkId, createHash('sha256').update(secret).digest('hex')],
  )
  return { linkId, cookie: `gw_guest=${TENANT}.${sessionId}.${secret}` }
}

const MESSAGE_SYNC = 0

type Client = {
  doc: Y.Doc
  ws: WebSocket
  /** Resolves with the close code, whenever the server closes. */
  closed: Promise<number>
  close: () => void
}

async function connect(
  port: number,
  dayId: string,
  headers: Record<string, string>,
): Promise<Client> {
  const doc = new Y.Doc()
  const ws = new WebSocket(`ws://127.0.0.1:${port}/collab?workshop=${workshopId}&day=${dayId}`, {
    headers,
  })
  const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)))

  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)))
  })

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
    if (encoding.length(encoder) > 1 && ws.readyState === ws.OPEN) {
      ws.send(encoding.toUint8Array(encoder))
    }
  })

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || ws.readyState !== ws.OPEN) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    ws.send(encoding.toUint8Array(encoder))
  })

  return { doc, ws, closed, close: () => ws.close() }
}

/** The close code, or 'still open' -- raced, so a missing close is a failure and not a timeout. */
function closeWithin(client: Client, ms = 3_000): Promise<number | 'still open'> {
  return Promise.race([
    client.closed,
    new Promise<'still open'>((resolve) => setTimeout(() => resolve('still open'), ms)),
  ])
}

function addBlock(doc: Y.Doc, title: string): string {
  const id = uuidv7()
  const block = new Y.Map<unknown>()
  block.set('kind', 'module')
  block.set('position', `a${id.slice(-6)}`)
  block.set('parentId', null)
  block.set('title', title)
  block.set('moduleTypeId', moduleTypeId)
  block.set('durationMinutes', 15)
  blocksOf(doc).set(id, block)
  return id
}

const ACCESS_WITHDRAWN = 4401
const TOO_LARGE = 4413
const TOO_FAST = 4429

describe('a socket whose access is withdrawn while it is open', () => {
  it('is closed when the guest invitation is withdrawn', async () => {
    const dayId = await newDay()
    const invited = await guest()
    const client = await connect(NOTIFY_PORT, dayId, { cookie: invited.cookie })

    await ops.query('update workshop_share_link set revoked_at = now() where id = $1', [
      invited.linkId,
    ])

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
  })

  it('is closed when the member signs out elsewhere', async () => {
    const dayId = await newDay()
    const person = await colleague()
    const client = await connect(NOTIFY_PORT, dayId, { cookie: person.cookie })

    await ops.query('update auth_session set revoked_at = now() where identity_id = $1', [
      person.identityId,
    ])

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
  })

  it('is closed when an admin disables the member', async () => {
    const dayId = await newDay()
    const person = await colleague()
    const client = await connect(NOTIFY_PORT, dayId, { cookie: person.cookie })

    await ops.query(`update member set status = 'disabled' where id = $1`, [person.memberId])

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
  })

  it('is closed when the workshop is no longer shared with the member', async () => {
    const dayId = await newDay()
    const person = await colleague()
    const client = await connect(NOTIFY_PORT, dayId, { cookie: person.cookie })
    // Into the room first. The socket opens before the room has loaded, and a
    // share removed in that gap is refused by the load rather than by the
    // notification this test is about.
    await settle()

    await ops.query('delete from workshop_collaborator where member_id = $1', [person.memberId])

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
  })

  it('is closed when the collaborator is turned into a viewer', async () => {
    // Still allowed in, no longer allowed to write -- and a socket here is a
    // write socket.
    const dayId = await newDay()
    const person = await colleague()
    const client = await connect(NOTIFY_PORT, dayId, { cookie: person.cookie })

    await ops.query(`update workshop_collaborator set role = 'viewer' where member_id = $1`, [
      person.memberId,
    ])

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
  })

  it('is closed when the access token it connected with is revoked', async () => {
    const dayId = await newDay()
    const person = await colleague()
    const pat = generatePersonalAccessToken()
    const patId = randomUUID()
    await ops.query(
      `insert into personal_access_token (id, tenant_id, member_id, name, token_id, token_hash, scopes)
       values ($1, $2, $3, 'guards', $4, $5, '{workshops:read,workshops:write}')`,
      [patId, TENANT, person.memberId, pat.tokenId, pat.tokenHash],
    )
    const client = await connect(NOTIFY_PORT, dayId, { authorization: `Bearer ${pat.token}` })

    await ops.query('update personal_access_token set revoked_at = now() where id = $1', [patId])

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
  })

  it('leaves everybody else in the room connected', async () => {
    const dayId = await newDay()
    const invited = await guest()
    const owner = await connect(NOTIFY_PORT, dayId, { cookie: ownerCookie })
    const client = await connect(NOTIFY_PORT, dayId, { cookie: invited.cookie })

    await ops.query('update workshop_share_link set revoked_at = now() where id = $1', [
      invited.linkId,
    ])
    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)

    expect(owner.ws.readyState).toBe(WebSocket.OPEN)
    owner.close()
  })

  it('does not apply a write that arrives after the withdrawal', async () => {
    // No notification on this server: what is under test is that a write is
    // checked on its own, so that the notification is a way to be quick and
    // not the only thing between a withdrawn guest and the record.
    const dayId = await newDay()
    const invited = await guest()
    const owner = await connect(GATE_PORT, dayId, { cookie: ownerCookie })
    const client = await connect(GATE_PORT, dayId, { cookie: invited.cookie })
    await settle()

    await ops.query('update workshop_share_link set revoked_at = now() where id = $1', [
      invited.linkId,
    ])
    const blockId = addBlock(client.doc, 'Nach dem Entzug')

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
    await settle(800)

    expect(blocksOf(owner.doc).has(blockId)).toBe(false)
    owner.close()
    await settle(800)

    const { rows } = await ops.query('select id from module where id = $1', [blockId])
    expect(rows).toHaveLength(0)
  })

  it('is closed by the periodic check when no notification arrives', async () => {
    const dayId = await newDay()
    const invited = await guest()
    const client = await connect(SWEEP_PORT, dayId, { cookie: invited.cookie })

    await ops.query('update workshop_share_link set revoked_at = now() where id = $1', [
      invited.linkId,
    ])

    await expect(closeWithin(client)).resolves.toBe(ACCESS_WITHDRAWN)
  })
})

describe('quotas on a socket that is allowed in', () => {
  it('closes a socket that sends faster than anybody types', async () => {
    const dayId = await newDay()
    const client = await connect(LIMIT_PORT, dayId, { cookie: ownerCookie })

    // Sync step 1 is the cheapest message there is to send and not free to
    // answer: every one makes the server encode its state vector.
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, new Y.Doc())
    const message = encoding.toUint8Array(encoder)
    for (let i = 0; i < 200; i++) client.ws.send(message)

    await expect(closeWithin(client)).resolves.toBe(TOO_FAST)
  })

  it('refuses to let a document grow past its limit', async () => {
    const dayId = await newDay()
    const owner = await connect(LIMIT_PORT, dayId, { cookie: ownerCookie })
    const writer = await connect(LIMIT_PORT, dayId, { cookie: ownerCookie })
    await settle()

    // Each one well under the frame limit and the byte quota; together far past
    // what the document may hold.
    const ids: string[] = []
    for (let i = 0; i < 8; i++) {
      ids.push(addBlock(writer.doc, `${i}`.padEnd(16 * 1024, 'x')))
      await settle(100)
    }

    await expect(closeWithin(writer)).resolves.toBe(TOO_LARGE)
    await settle()

    const size = Y.encodeStateAsUpdate(owner.doc).byteLength
    expect(size).toBeLessThanOrEqual(64 * 1024 + 20 * 1024)
    expect(ids.filter((id) => blocksOf(owner.doc).has(id)).length).toBeLessThan(ids.length)
    owner.close()
  })

  it('refuses a connection to a room that is full', async () => {
    const dayId = await newDay()
    const inside = [
      await connect(LIMIT_PORT, dayId, { cookie: ownerCookie }),
      await connect(LIMIT_PORT, dayId, { cookie: ownerCookie }),
      await connect(LIMIT_PORT, dayId, { cookie: ownerCookie }),
    ]

    await expect(connect(LIMIT_PORT, dayId, { cookie: ownerCookie })).rejects.toThrow(/503/)

    for (const client of inside) client.close()
  })
})
