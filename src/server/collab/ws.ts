import { createServer, type IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type * as Y from 'yjs'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { encodeAwarenessUpdate } from 'y-protocols/awareness'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { SESSION_COOKIE_NAMES, verifySessionCookie } from '@/server/auth/session'
import { withTenant, type Actor } from '@/server/db'
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
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

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
  const http = createServer((_req, res) => {
    // Anything that is not an upgrade gets a plain answer, so a misrouted
    // health check does not look like a hang.
    res.writeHead(426, { 'content-type': 'text/plain' })
    res.end('WebSocket erwartet.\n')
  })

  const wss = new WebSocketServer({ noServer: true })

  http.on('upgrade', (request, socket, head) => {
    void (async () => {
      const target = parseTarget(request, path)
      if (!target) return reject(socket, 400, 'Ungültiger Pfad.')

      const actor = await authenticate(request, target.workshopId)
      if (!actor) return reject(socket, 401, 'Nicht angemeldet oder kein Zugriff.')

      wss.handleUpgrade(request, socket, head, (ws) => {
        void attach(ws, target.workshopId, target.dayId, actor, timings)
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
 * Session cookie plus the same per-workshop capability check the web app uses.
 *
 * Read access is not enough: a socket that can only read still receives every
 * keystroke, so a viewer gets a connection but their updates are ignored
 * (see `attach`). Write access is checked here so a reader never even opens
 * one under the impression they can edit.
 */
async function authenticate(request: IncomingMessage, workshopId: string): Promise<Actor | null> {
  const cookies = parseCookies(request.headers.cookie ?? '')
  const raw = SESSION_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean)
  if (!raw) return null

  const session = await verifySessionCookie(raw)
  if (!session) return null

  const actor: Actor = {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    source: 'web',
  }

  try {
    await withTenant(actor, (tx) =>
      assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write'),
    )
    return actor
  } catch {
    return null
  }
}

async function attach(
  ws: WebSocket,
  workshopId: string,
  dayId: string,
  actor: Actor,
  timings: RoomTimings,
) {
  const key = roomKey(workshopId, dayId)

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
    if (origin === connection) return
    const changed = [...added, ...updated, ...removed]
    if (changed.length > 0) {
      connection.send(message(MESSAGE_AWARENESS, encodeAwarenessUpdate(room.awareness, changed)))
    }
  }
  room.awareness.on('update', onAwareness)

  ws.on('message', (data: Buffer) => {
    try {
      handleMessage(room, connection, new Uint8Array(data))
    } catch (error) {
      console.error('collab: bad message', { dayId, error })
    }
  })

  ws.on('close', () => {
    room.doc.off('update', onUpdate)
    room.awareness.off('update', onAwareness)
    room.remove(connection)
  })

  ws.on('error', () => ws.close())
}

function handleMessage(room: Room, connection: Connection, data: Uint8Array): void {
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
    room.applyAwareness(update, connection)
    return
  }
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
