import { createServer, type IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type * as Y from 'yjs'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { encodeAwarenessUpdate } from 'y-protocols/awareness'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import { authConfig } from '@/server/auth/config'
import { SESSION_COOKIE_NAMES, verifySessionCookie } from '@/server/auth/session'
import { withTenant, type Actor } from '@/server/db'
import { hasScope, resolveBearer } from '@/server/mcp/auth'
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

const rooms = new Map<string, Room>()
const roomKey = (workshopId: string, dayId: string) => `${workshopId}:${dayId}`

export type CollabServerOptions = {
  port: number
  host?: string
  path?: string
  timings?: RoomTimings
}

export function startCollabServer(options: CollabServerOptions) {
  const path = options.path ?? '/collab'
  const timings = options.timings ?? DEFAULT_TIMINGS
  const http = createServer((req, res) => {
    // A real health endpoint: a process supervisor and a test runner both need
    // one, and both read 426 as "not ready" rather than as "working correctly".
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }))
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
  // without doing anything the protocol forbids.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })

  http.on('upgrade', (request, socket, head) => {
    void (async () => {
      const target = parseTarget(request, path)
      if (!target) return reject(socket, 400, 'Ungültiger Pfad.')

      if (!sameOrigin(request)) return reject(socket, 403, 'Fremde Herkunft.')

      const actor = await authenticate(request, target.workshopId, target.dayId)
      if (!actor) return reject(socket, 401, 'Nicht angemeldet oder kein Zugriff.')

      wss.handleUpgrade(request, socket, head, (ws) => {
        // A failure in here used to be an unhandled rejection and an open,
        // silent socket: the client waited for a sync that was never coming
        // and blamed the network. Close it and say why.
        attach(ws, target.workshopId, target.dayId, actor, timings).catch((error) => {
          console.error('collab: attach failed', { workshop: target.workshopId, error })
          ws.close(1011, 'Raum konnte nicht geöffnet werden.')
        })
      })
    })().catch((error) => {
      console.error('collab: upgrade failed', error)
      reject(socket, 500, 'Interner Fehler.')
    })
  })

  http.listen(options.port, options.host ?? '0.0.0.0', () => {
    console.log(`collab: bereit auf ${options.host ?? '0.0.0.0'}:${options.port}${path}`)
  })

  return {
    close: async () => {
      for (const room of rooms.values()) await room.flush()
      rooms.clear()
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
 */
async function authenticate(
  request: IncomingMessage,
  workshopId: string,
  dayId: string,
): Promise<Actor | null> {
  const actor = await identify(request)
  if (!actor) return null

  try {
    await withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
      await assertDayInWorkshop(tx, access, dayId)
    })
    return actor
  } catch {
    return null
  }
}

async function identify(request: IncomingMessage): Promise<Actor | null> {
  const header = request.headers.authorization
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

  const cookies = parseCookies(request.headers.cookie ?? '')
  const raw = SESSION_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean)
  if (!raw) return null

  const session = await verifySessionCookie(raw)
  if (!session) return null

  return {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    displayName: session.displayName || session.email,
    source: 'web',
  }
}

/**
 * A name for an actor that has none. An MCP token belongs to a person, but the
 * room is showing what is typing, and that is the tool.
 */
function fallbackName(actor: Actor): string {
  return actor.source === 'mcp' ? 'KI-Assistent' : 'Mitglied'
}

async function attach(
  ws: WebSocket,
  workshopId: string,
  dayId: string,
  actor: Actor,
  timings: RoomTimings,
) {
  const key = roomKey(workshopId, dayId)

  /**
   * The socket is already receiving, and the room is not ready yet.
   *
   * A client sends its first sync step the moment the socket opens, and `ws`
   * DISCARDS a message that has no listener rather than buffering it. Opening
   * a room reads the log and, for a day nobody has opened before, the whole
   * day out of the database -- easily long enough to lose that first message,
   * after which both sides wait for each other forever.
   */
  const queued: Uint8Array[] = []
  let deliver = (data: Uint8Array) => {
    queued.push(data)
  }
  ws.on('message', (data: Buffer) => deliver(new Uint8Array(data)))
  ws.on('error', () => ws.close())

  let room = rooms.get(key)
  if (!room) {
    room = new Room(workshopId, dayId, actor, () => rooms.delete(key), timings)
    rooms.set(key, room)
    await room.load()
  }

  const connection: Connection = {
    send: (data) => ws.readyState === ws.OPEN && ws.send(data),
    close: () => ws.close(),
  }
  room.add(connection)

  // Step one of the sync protocol: tell the client what we have, so it can
  // send back only what we are missing.
  connection.send(encodeSyncStep1(room.doc))

  const awarenessStates = [...room.awareness.getStates().keys()]
  if (awarenessStates.length > 0) {
    connection.send(
      message(MESSAGE_AWARENESS, encodeAwarenessUpdate(room.awareness, awarenessStates)),
    )
  }

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    // Never echo an update back to the client that sent it.
    if (origin === connection) return
    connection.send(encodeSyncUpdate(update))
  }
  room.doc.on('update', onUpdate)

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
      connection.send(message(MESSAGE_AWARENESS, encodeAwarenessUpdate(room.awareness, changed)))
    }
  }
  room.awareness.on('update', onAwareness)

  ws.on('close', () => {
    room.doc.off('update', onUpdate)
    room.awareness.off('update', onAwareness)
    room.remove(connection)
  })

  const open = room
  deliver = (data) => {
    void handleMessage(open, connection, data, actor).catch((error) => {
      console.error('collab: bad message', { dayId, error })
    })
  }
  for (const data of queued.splice(0)) deliver(data)
}

async function handleMessage(
  room: Room,
  connection: Connection,
  data: Uint8Array,
  actor: Actor,
): Promise<void> {
  const decoder = decoding.createDecoder(data)
  const type = decoding.readVarUint(decoder)

  if (type === MESSAGE_SYNC) {
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
      displayName: actor.displayName?.trim() || fallbackName(actor),
      source: actor.source,
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
    const contentVersion = await room.flushNow()
    connection.send(
      controlMessage({ op: 'flushed', id: request.id, contentVersion: contentVersion.toString() }),
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
