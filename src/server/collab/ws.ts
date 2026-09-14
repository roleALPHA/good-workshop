import { createServer, type IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type * as Y from 'yjs'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { encodeAwarenessUpdate } from 'y-protocols/awareness'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import { DomainError } from '@/domain/errors'
import { authConfig } from '@/server/auth/config'
import { SESSION_COOKIE_NAMES, verifySessionCookie } from '@/server/auth/session'
import { GUEST_COOKIE_NAMES, guestActor, verifyGuestCookie } from '@/server/auth/share-session'
import { listen, withTenant, type Actor } from '@/server/db'
import { hasScope, resolveBearer } from '@/server/mcp/auth'
import {
  CLOSE_ACCESS_WITHDRAWN,
  CLOSE_DOCUMENT_TOO_LARGE,
  CLOSE_TOO_MANY_MESSAGES,
  CLOSE_TRY_AGAIN_LATER,
  DEFAULT_LIMITS,
  TokenBucket,
  type CollabLimits,
} from './limits'
import { DEFAULT_TIMINGS, Room, type Connection, type RoomTimings } from './room'

/**
 * The collaboration server.
 *
 * Its own process rather than a Next route handler, because route handlers
 * cannot take over an HTTP connection for a WebSocket upgrade -- and its own
 * process inside the SAME image rather than a second image, so the on-prem
 * promise stays "one image plus Postgres".
 *
 * Authentication is the session cookie the browser already sends on the
 * upgrade request. No ticket endpoint, no second token to mint and expire:
 * the credential that opens the editor is the credential that opens the socket.
 * A personal access token is accepted the same way, because an LLM writing
 * through MCP is a participant here and not a special case.
 *
 * And it is not only asked once. A socket lives for hours, and the web process
 * withdraws access without any line to this one -- so the credential is kept
 * and asked again: at once when Postgres says access changed somewhere (see
 * drizzle/0009_access_changed_notify.sql), on a timer in case that message
 * never arrives, and before any message is handled on a check that has grown
 * old. A "no" closes the socket.
 */

const MAX_FRAME_BYTES = 1024 * 1024

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
/**
 * Out-of-band requests that are not part of the Yjs protocol.
 *
 * Exactly one so far: "write the tables out now". A human editor never needs
 * it -- they read the document, not the tables -- but a tool call has to be
 * able to answer "is it saved" with something better than a debounce timer.
 */
const MESSAGE_CONTROL = 2

/** Written by the triggers in drizzle/0009_access_changed_notify.sql. */
const ACCESS_CHANNEL = 'gw_access_changed'

const roomKey = (workshopId: string, dayId: string) => `${workshopId}:${dayId}`

export type CollabServerOptions = {
  port: number
  host?: string
  path?: string
  timings?: RoomTimings
  limits?: Partial<CollabLimits>
  /**
   * Listen for access changes in Postgres. Off only in tests that have to
   * prove the timer and the per-message check work without it.
   */
  notifications?: boolean
}

/** What the socket was opened with, kept so it can be asked again. */
type Credential = { authorization?: string; cookie?: string }

type Verdict = 'ok' | 'denied' | 'unknown'

type Participant = {
  ws: WebSocket
  credential: Credential
  actor: Actor
  workshopId: string
  dayId: string
  verifiedAt: number
  /** The check in flight, so a second one queues behind it rather than beside it. */
  checking: Promise<Verdict>
}

type Joined = { room: Room; connection: Connection; participant: Participant; leave: () => void }

type Server = {
  rooms: Map<string, Room>
  participants: Set<Participant>
  limits: CollabLimits
  timings: RoomTimings
}

export function startCollabServer(options: CollabServerOptions) {
  const path = options.path ?? '/collab'
  const server: Server = {
    rooms: new Map(),
    participants: new Set(),
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    timings: options.timings ?? DEFAULT_TIMINGS,
  }

  const http = createServer((req, res) => {
    // A real health endpoint: a process supervisor and a test runner both need
    // one, and both read 426 as "not ready" rather than as "working correctly".
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', rooms: server.rooms.size }))
      return
    }

    // Anything else that is not an upgrade gets a plain answer, so a misrouted
    // request does not look like a hang.
    res.writeHead(426, { 'content-type': 'text/plain' })
    res.end('WebSocket erwartet.\n')
  })

  // Yjs updates for a workshop day are kilobytes. The ws default is 100 MiB per
  // frame, and every frame is applied to the document and then buffered towards
  // a bytea column -- so one authenticated editor could fill memory and disk
  // without doing anything the protocol forbids. The frame limit bounds one
  // message; limits.ts bounds how many, and how large the document gets.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })

  http.on('upgrade', (request, socket, head) => {
    void (async () => {
      const target = parseTarget(request, path)
      if (!target) return reject(socket, 400, 'Invalid path.')

      if (!sameOrigin(request)) {
        // Logged, because the failure mode is a document that silently stays
        // "offline" -- and the usual cause is a misconfigured GW_APP_URL
        // rather than an attack.
        console.warn('collab: upgrade refused, foreign origin', {
          origin: request.headers.origin,
          expected: authConfig.origin,
        })
        return reject(socket, 403, 'Foreign origin.')
      }

      const credential = credentialOf(request)
      const actor = await authorize(credential, target.workshopId, target.dayId, {
        lock: true,
      }).catch(() => null)
      if (!actor) return reject(socket, 401, 'Not signed in, or no access.')

      // Checked again in attach(), which is the one that counts; this one only
      // saves a full room the cost of an upgrade it is going to close.
      const room = server.rooms.get(roomKey(target.workshopId, target.dayId))
      if (room && room.connections.size >= server.limits.maxConnectionsPerRoom) {
        return reject(socket, 503, 'Room is full.')
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        // A failure in here used to be an unhandled rejection and an open,
        // silent socket: the client waited for a sync that was never coming
        // and blamed the network. Close it and say why.
        attach(server, ws, target.workshopId, target.dayId, actor, credential).catch((error) => {
          console.error('collab: attach failed', { workshop: target.workshopId, error })
          ws.close(1011, 'The room could not be opened.')
        })
      })
    })().catch((error) => {
      console.error('collab: upgrade failed', error)
      reject(socket, 500, 'Interner Fehler.')
    })
  })

  // The fallback: every socket whose last check is older than the interval is
  // checked again, whether or not anything was heard from Postgres.
  const sweeper =
    server.limits.revalidateMs > 0
      ? setInterval(() => void sweep(server, 'stale'), server.limits.revalidateMs)
      : null
  sweeper?.unref()

  // A burst of changes -- an admin removing a member cascades through several
  // tables in several transactions -- is one re-check, not one per transaction.
  let nudge: NodeJS.Timeout | null = null
  const checkEveryone = () => {
    if (nudge) return
    nudge = setTimeout(() => {
      nudge = null
      void sweep(server, 'all')
    }, 50)
  }
  const listener =
    options.notifications === false ? null : listen(ACCESS_CHANNEL, checkEveryone, checkEveryone)

  http.listen(options.port, options.host ?? '0.0.0.0', () => {
    console.log(`collab: bereit auf ${options.host ?? '0.0.0.0'}:${options.port}${path}`)
  })

  return {
    close: async () => {
      if (sweeper) clearInterval(sweeper)
      if (nudge) clearTimeout(nudge)
      await listener?.close()
      for (const room of server.rooms.values()) await room.flush()
      server.rooms.clear()
      wss.close()
      http.close()
    },
  }
}

function parseTarget(request: IncomingMessage, path: string) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname !== path) return null

  const workshopId = url.searchParams.get('workshop')
  const dayId = url.searchParams.get('day')
  return workshopId && dayId ? { workshopId, dayId } : null
}

function credentialOf(request: IncomingMessage): Credential {
  return { authorization: request.headers.authorization, cookie: request.headers.cookie }
}

/**
 * Where the browser says it is.
 *
 * A cross-site handshake already fails today, because the session cookie is
 * SameSite=Lax and a WebSocket upgrade is not a top-level navigation. That is a
 * real defence, but it lives in another file and protects this one by accident;
 * anybody loosening `sameSite` would have no reason to look here.
 *
 * A missing Origin is allowed through: non-browser clients do not send one, and
 * the MCP path is exactly that. Origin is a browser's statement about itself,
 * so its absence carries no claim to reject.
 */
function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true

  try {
    return new URL(origin).origin === authConfig.origin
  } catch {
    return false
  }
}

/**
 * A session cookie or a personal access token, then the same per-workshop
 * capability check the web app uses -- and then the part that was missing: that
 * the day this socket is about is a day of that workshop.
 *
 * Read access is not enough: a socket that can only read still receives every
 * keystroke, so a viewer gets a connection but their updates are ignored
 * (see `attach`). Write access is checked here so a reader never even opens
 * one under the impression they can edit.
 *
 * The day check belongs here rather than in `Room.load()`, which is where it
 * used to half-live: load() returns early for a day that already has CRDT
 * state, so the check it does run is the one nobody needed -- an unopened day
 * -- while every real workshop took the early return. Checking before the room
 * is opened also covers MCP, whose writes come through this same socket.
 *
 * `null` is a refusal. A throw is "could not ask" -- the database is away --
 * and the callers treat the two differently: a handshake refuses either way,
 * but a socket that is already open is not closed because Postgres blinked.
 *
 * `lock` only at the handshake, where it always was. The re-checks run for
 * every open socket at once, and taking the workshop row lock for each would
 * queue them behind every structural edit and every materialisation.
 */
async function authorize(
  credential: Credential,
  workshopId: string,
  dayId: string,
  { lock }: { lock: boolean },
): Promise<Actor | null> {
  const actor = await identify(credential)
  if (!actor) return null

  try {
    await withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write', {
        forUpdate: lock,
      })
      await assertDayInWorkshop(tx, access, dayId)
    })
    return actor
  } catch (error) {
    if (error instanceof DomainError) return null
    throw error
  }
}

async function identify(credential: Credential): Promise<Actor | null> {
  const header = credential.authorization
  if (header) {
    const pat = await resolveBearer(header)
    // A read-only token opening a write socket is a mistake worth naming
    // early rather than letting it connect and silently drop every update.
    if (!pat || !hasScope(pat, 'workshops:write')) return null
    return {
      tenantId: pat.tenantId,
      memberId: pat.memberId,
      tenantRole: pat.tenantRole,
      source: 'mcp',
    }
  }

  const cookies = parseCookies(credential.cookie ?? '')

  const raw = SESSION_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean)
  if (raw) {
    const session = await verifySessionCookie(raw)
    if (session) {
      return {
        tenantId: session.tenantId,
        memberId: session.memberId,
        tenantRole: session.tenantRole,
        displayName: session.displayName || session.email,
        source: 'web',
      }
    }
    // Deliberately falls through rather than refusing. A session cookie outlives
    // the session it names -- revoked, idle, expired, or left behind by somebody
    // who is no longer a member -- and a stale one must not shadow a perfectly
    // good guest cookie in the same browser. Refusing here would give that guest
    // an editor that renders and never connects, which is the worst of the three
    // possible outcomes.
  }

  /**
   * A share-link guest, third and last.
   *
   * After the member cookie rather than before it, so that a member who opens an
   * invitation to check it stays themselves in the room -- they hold both
   * cookies, and the stronger credential is the one they should act under.
   *
   * Nothing here decides whether the guest may WRITE. `authorize` above
   * already demands workshop.content.write before the upgrade, and for a guest
   * invited to read that check fails on the capability table alone -- so a
   * read-only guest is refused at the handshake without a line of special case
   * anywhere in this file.
   */
  const guestRaw = GUEST_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean)
  if (!guestRaw) return null

  const guest = await verifyGuestCookie(guestRaw)
  return guest ? guestActor(guest) : null
}

/**
 * Whether a re-check still describes the same participant.
 *
 * A credential cannot change hands, but the stale-session fall-through in
 * `identify` means the same Cookie header can resolve to a different actor
 * later -- a member cookie that expired, leaving the guest cookie beside it.
 * That is not the participant who was let in, and the room says who is typing.
 */
function sameParticipant(now: Actor, then: Actor): boolean {
  return (
    now.tenantId === then.tenantId &&
    (now.memberId ?? null) === (then.memberId ?? null) &&
    (now.share?.linkId ?? null) === (then.share?.linkId ?? null)
  )
}

/**
 * Asks again, and closes the socket on a "no".
 *
 * Chained onto the previous check rather than reusing it: a notification that
 * arrives while a check is running may be about a change that check started
 * too early to see.
 */
function revalidate(participant: Participant): Promise<Verdict> {
  const run = async (): Promise<Verdict> => {
    if (participant.ws.readyState !== participant.ws.OPEN) return 'denied'

    let actor: Actor | null
    try {
      actor = await authorize(participant.credential, participant.workshopId, participant.dayId, {
        lock: false,
      })
    } catch (error) {
      console.warn('collab: could not re-check access', { dayId: participant.dayId, error })
      return 'unknown'
    }

    if (!actor || !sameParticipant(actor, participant.actor)) {
      participant.ws.close(CLOSE_ACCESS_WITHDRAWN, 'Access withdrawn.')
      return 'denied'
    }

    // A role may have changed without taking write access away.
    participant.actor = actor
    participant.verifiedAt = Date.now()
    return 'ok'
  }

  participant.checking = participant.checking.then(run, run)
  return participant.checking
}

/** Re-checks every open socket, or only those whose last check has grown old. */
async function sweep(server: Server, which: 'all' | 'stale'): Promise<void> {
  const cutoff = Date.now() - server.limits.revalidateMs
  // One at a time: a notification re-checks every socket in the process, and
  // doing that in parallel would take the whole pool from the requests that
  // are writing.
  for (const participant of [...server.participants]) {
    if (which === 'stale' && participant.verifiedAt > cutoff) continue
    await revalidate(participant)
  }
}

/**
 * Before a message is handled: is the last check recent enough to act on?
 *
 * This is what keeps a withdrawn guest out of the record when the notification
 * is late or lost -- the message waits for the answer, and the answer decides.
 * "Could not ask" closes the socket too, but as a failure, so the client
 * reconnects and resyncs: dropping one message and carrying on would leave it
 * believing the server has something it does not.
 */
async function stillAllowed(server: Server, participant: Participant): Promise<boolean> {
  if (Date.now() - participant.verifiedAt < server.limits.revalidateMs) return true

  const verdict = await revalidate(participant)
  if (verdict === 'unknown') participant.ws.close(1011, 'Access could not be checked.')
  return verdict === 'ok'
}

/**
 * A name for an actor that has none. An MCP token belongs to a person, but the
 * room is showing what is typing, and that is the tool.
 */
function fallbackName(actor: Actor): string {
  if (actor.source === 'mcp') return 'KI-Assistent'
  // A guest always has one -- guestActor puts the invited address in
  // displayName -- so this is the belt to that braces rather than the normal
  // path. It says "guest" because somebody in the room seeing an unnamed
  // participant should know it is an external one.
  if (actor.source === 'guest') return 'Gast'
  return 'Mitglied'
}

async function attach(
  server: Server,
  ws: WebSocket,
  workshopId: string,
  dayId: string,
  actor: Actor,
  credential: Credential,
) {
  const { limits, rooms } = server
  const key = roomKey(workshopId, dayId)
  const verifiedAt = Date.now()

  const messages = new TokenBucket(limits.messageBurst, limits.messagesPerSecond)
  const bytes = new TokenBucket(limits.byteBurst, limits.bytesPerSecond)
  const shut = (code: number, reason: string) => {
    if (ws.readyState === ws.OPEN) ws.close(code, reason)
  }

  /**
   * The socket is already receiving, and the room is not ready yet.
   *
   * A client sends its first sync step the moment the socket opens, and `ws`
   * DISCARDS a message that has no listener rather than buffering it. Opening
   * a room reads the log and, for a day nobody has opened before, the whole
   * day out of the database -- easily long enough to lose that first message,
   * after which both sides wait for each other forever.
   *
   * So every message goes onto one chain, which waits for the room and then
   * handles messages strictly in order -- a flush reply has to come after
   * everything sent before it, and a permission check that makes one message
   * wait must make the ones behind it wait too. The chain is bounded: a
   * participant cannot park an unlimited number of messages in memory behind a
   * slow check or a slow room.
   */
  let resolveJoined!: (joined: Joined | null) => void
  const joined = new Promise<Joined | null>((resolve) => {
    resolveJoined = resolve
  })
  let chain: Promise<void> = Promise.resolve()
  let backlog = 0
  let closed = false

  ws.on('message', (raw: Buffer) => {
    if (closed || ws.readyState !== ws.OPEN) return
    if (!messages.take(1) || !bytes.take(raw.byteLength)) {
      return shut(CLOSE_TOO_MANY_MESSAGES, 'Too many messages.')
    }
    if (backlog >= limits.maxQueuedMessages) {
      return shut(CLOSE_TOO_MANY_MESSAGES, 'Too many messages waiting.')
    }

    const data = new Uint8Array(raw)
    backlog += 1
    chain = chain
      .then(async () => {
        const state = await joined
        if (!state || closed) return
        await handleMessage(server, state, data)
      })
      .catch((error) => console.error('collab: bad message', { dayId, error }))
      .finally(() => {
        backlog -= 1
      })
  })
  ws.on('error', () => ws.close())
  ws.on('close', () => {
    closed = true
    void joined.then((state) => state?.leave())
  })

  try {
    let room = rooms.get(key)
    if (!room) {
      room = new Room(workshopId, dayId, actor, () => rooms.delete(key), server.timings)
      rooms.set(key, room)
    }
    const open = room

    try {
      // Awaited by everybody, not only by whoever created the room: arriving
      // while it loads has to mean waiting for the day, not an empty document.
      await open.load()
    } catch (error) {
      // A room that could not load must not stay registered. The next arrival
      // would find it, skip the load, and be served an empty document -- which
      // the materialiser then writes back over the day.
      if (rooms.get(key) === open && open.connections.size === 0) rooms.delete(key)
      if (error instanceof DomainError) {
        // Access went away between the handshake and the room opening.
        shut(CLOSE_ACCESS_WITHDRAWN, 'Access withdrawn.')
        resolveJoined(null)
        return
      }
      throw error
    }

    // Several handshakes can pass the early check in the upgrade handler
    // together; this one runs after the await and is the one that holds.
    if (open.connections.size >= limits.maxConnectionsPerRoom) {
      shut(CLOSE_TRY_AGAIN_LATER, 'The room is full.')
      resolveJoined(null)
      return
    }

    const connection: Connection = {
      send: (data) => {
        if (ws.readyState !== ws.OPEN) return
        // A participant who stops reading would otherwise have everything
        // everybody else types buffered for them, without end.
        if (ws.bufferedAmount + data.byteLength > limits.maxBufferedBytes) {
          return shut(CLOSE_TRY_AGAIN_LATER, 'Not reading fast enough.')
        }
        ws.send(data)
      },
      close: () => ws.close(),
    }
    open.add(connection)

    const participant: Participant = {
      ws,
      credential,
      actor,
      workshopId,
      dayId,
      verifiedAt,
      checking: Promise.resolve('ok'),
    }
    server.participants.add(participant)

    // Step one of the sync protocol: tell the client what we have, so it can
    // send back only what we are missing.
    connection.send(encodeSyncStep1(open.doc))

    const awarenessStates = [...open.awareness.getStates().keys()]
    if (awarenessStates.length > 0) {
      connection.send(
        message(MESSAGE_AWARENESS, encodeAwarenessUpdate(open.awareness, awarenessStates)),
      )
    }

    const onUpdate = (update: Uint8Array, origin: unknown) => {
      // Never echo an update back to the client that sent it.
      if (origin === connection) return
      connection.send(encodeSyncUpdate(update))
    }
    open.doc.on('update', onUpdate)

    const onAwareness = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === connection) {
        // The client's own awareness id, learned from its first presence
        // message. It is what lets `remove` clear this cursor when the socket
        // closes -- without it a closed tab leaves a ghost on everyone else's
        // page for as long as the room lives.
        const own = added[0] ?? updated[0]
        if (own !== undefined) connection.awarenessId = own
        return
      }
      const changed = [...added, ...updated, ...removed]
      if (changed.length > 0) {
        connection.send(message(MESSAGE_AWARENESS, encodeAwarenessUpdate(open.awareness, changed)))
      }
    }
    open.awareness.on('update', onAwareness)

    // Called from the close handler, including a close that happened while the
    // room was still loading: the connection is added and removed again, which
    // is what schedules the teardown of a room nobody ended up in.
    const leave = () => {
      open.doc.off('update', onUpdate)
      open.awareness.off('update', onAwareness)
      open.remove(connection)
      server.participants.delete(participant)
    }

    resolveJoined({ room: open, connection, participant, leave })
  } catch (error) {
    resolveJoined(null)
    throw error
  }
}

async function handleMessage(server: Server, joined: Joined, data: Uint8Array): Promise<void> {
  const { room, connection, participant } = joined

  // Every message, not only writes: a sync step 1 is answered with the whole
  // document, which is reading it.
  if (!(await stillAllowed(server, participant))) return

  const decoder = decoding.createDecoder(data)
  const type = decoding.readVarUint(decoder)

  if (type === MESSAGE_SYNC) {
    const writes = decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1
    if (writes && room.wouldExceed(data.byteLength, server.limits.maxDocBytes)) {
      // Closed rather than ignored: the client believes its update was sent,
      // and carrying on would leave it out of step with the room for good.
      console.warn('collab: document size limit reached', { dayId: room.dayId })
      participant.ws.close(CLOSE_DOCUMENT_TOO_LARGE, 'The document has reached its size limit.')
      return
    }

    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    // The origin is the connection, so the update is broadcast to everyone
    // else but never echoed back to its sender.
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, connection)

    if (encoding.length(encoder) > 1) connection.send(encoding.toUint8Array(encoder))
    return
  }

  if (type === MESSAGE_AWARENESS) {
    const update = decoding.readVarUint8Array(decoder)
    room.applyAwareness(update, connection, {
      displayName: participant.actor.displayName?.trim() || fallbackName(participant.actor),
      source: participant.actor.source,
    })
    return
  }

  if (type === MESSAGE_CONTROL) {
    const request = JSON.parse(new TextDecoder().decode(decoding.readVarUint8Array(decoder))) as {
      op?: string
      id?: string
    }
    if (request.op !== 'flush') return

    // Messages are handled in order, so a flush reply also proves that
    // whatever the caller sent before it has been applied. One round trip
    // answers both "did you get it" and "is it in the tables".
    const { contentVersion, rejected } = await room.flushNow()
    connection.send(
      controlMessage({
        op: 'flushed',
        id: request.id,
        contentVersion: contentVersion.toString(),
        // Additive: a client that does not read it is no worse off than before.
        rejected,
      }),
    )
  }
}

function controlMessage(payload: Record<string, unknown>): Uint8Array {
  return message(MESSAGE_CONTROL, new TextEncoder().encode(JSON.stringify(payload)))
}

function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, doc)
  return encoding.toUint8Array(encoder)
}

function encodeSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

function message(type: number, payload: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, type)
  encoding.writeVarUint8Array(encoder, payload)
  return encoding.toUint8Array(encoder)
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

function reject(
  socket: { write: (data: string) => void; destroy: () => void },
  status: number,
  reason: string,
) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}
