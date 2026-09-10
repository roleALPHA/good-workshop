import WebSocket from 'ws'
import * as Y from 'yjs'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'

/**
 * Joining a room from the server side.
 *
 * This exists so that an LLM writing through MCP is a collaborator rather than
 * a second writer. Before it, model writes went straight to the relational
 * tables while the materialiser wrote the CRDT back over them and deleted
 * whatever it did not hold -- so a block a model added while somebody had the
 * day open was silently removed a few seconds later. One day has exactly one
 * write path, and this is how a server-side caller reaches it.
 *
 * The side effect is the good kind: the model shows up in the room like anyone
 * else, so a person editing the day sees that something else is writing.
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const MESSAGE_CONTROL = 2

const SYNC_STEP_2 = 1

export class CollabUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Der Kollaborationsdienst ist nicht erreichbar (${detail}). ` +
        'Ohne ihn kann nicht geschrieben werden, weil sonst zwei Schreibwege auf denselben Tag zeigen.',
    )
    this.name = 'CollabUnavailableError'
  }
}

export type RoomTarget = {
  workshopId: string
  dayId: string
  /** Passed through verbatim; the room authenticates it exactly like a browser's cookie. */
  authorization: string
  /** How the writer appears to the people in the room. */
  presence?: { name: string; color: string }
  url?: string
  timeoutMs?: number
}

/**
 * Opens the room, applies one edit, waits for it to reach the tables, leaves.
 *
 * A short-lived connection rather than a pool: a tool call is a discrete
 * event, and a pooled socket would keep a model listed as present in a room it
 * stopped caring about ten minutes ago.
 */
export async function editInRoom<T>(
  target: RoomTarget,
  edit: (doc: Y.Doc) => T,
): Promise<{ result: T; contentVersion: bigint }> {
  const timeoutMs = target.timeoutMs ?? 15_000
  const socket = new WebSocket(collabUrl(target), {
    headers: { authorization: target.authorization },
  })

  const doc = new Y.Doc()
  const awareness = new Awareness(doc)
  const pending = new Map<string, (payload: Record<string, unknown>) => void>()
  let synced: (() => void) | null = null

  const send = (data: Uint8Array) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data)
  }

  // Anything not tagged as remote is ours, and has to go out.
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    send(frameSync((encoder) => syncProtocol.writeUpdate(encoder, update)))
  }
  doc.on('update', onUpdate)

  socket.on('message', (data: Buffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data))
    const type = decoding.readVarUint(decoder)

    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      const step = syncProtocol.readSyncMessage(decoder, encoder, doc, 'remote')
      if (encoding.length(encoder) > 1) send(encoding.toUint8Array(encoder))
      // Step two is the server's state. Everything the day contains is in the
      // document from here on, which is the point at which an edit is safe.
      if (step === SYNC_STEP_2) synced?.()
      return
    }

    if (type === MESSAGE_CONTROL) {
      const payload = JSON.parse(
        new TextDecoder().decode(decoding.readVarUint8Array(decoder)),
      ) as Record<string, unknown>
      const id = typeof payload.id === 'string' ? payload.id : ''
      pending.get(id)?.(payload)
    }
  })

  const closed = new Promise<never>((_, rejectClosed) => {
    socket.on('error', (error: Error) => rejectClosed(new CollabUnavailableError(error.message)))
    socket.on('unexpected-response', (_request, response) =>
      // The handshake was refused rather than the connection lost: almost
      // always a token without workshops:write, and worth saying so.
      rejectClosed(new CollabUnavailableError(`HTTP ${response.statusCode}`)),
    )
    socket.on('close', () => rejectClosed(new CollabUnavailableError('Verbindung beendet')))
  })
  // Nothing awaits `closed` on its own; without this Node reports the
  // rejection as unhandled the moment the socket is closed normally.
  closed.catch(() => {})

  try {
    return await withDeadline(timeoutMs, async () => {
      await Promise.race([once(socket, 'open'), closed])

      const ready = new Promise<void>((resolve) => {
        synced = resolve
      })
      send(frameSync((encoder) => syncProtocol.writeSyncStep1(encoder, doc)))
      await Promise.race([ready, closed])

      if (target.presence) {
        awareness.setLocalStateField('user', target.presence)
        send(frame(MESSAGE_AWARENESS, encodeAwarenessUpdate(awareness, [doc.clientID])))
      }

      const result = edit(doc)

      // The reply proves the edit was applied AND written out: the room
      // handles messages in order, so a flush that comes back necessarily
      // came after everything sent before it.
      const contentVersion = await Promise.race([flush(send, pending), closed])

      if (target.presence) {
        removeAwarenessStates(awareness, [doc.clientID], 'leaving')
        send(frame(MESSAGE_AWARENESS, encodeAwarenessUpdate(awareness, [doc.clientID])))
      }

      return { result, contentVersion }
    })
  } finally {
    doc.off('update', onUpdate)
    awareness.destroy()
    socket.close()
    doc.destroy()
  }
}

async function flush(
  send: (data: Uint8Array) => void,
  pending: Map<string, (payload: Record<string, unknown>) => void>,
): Promise<bigint> {
  const id = Math.random().toString(36).slice(2)
  const answered = new Promise<Record<string, unknown>>((resolve) => pending.set(id, resolve))
  send(frame(MESSAGE_CONTROL, new TextEncoder().encode(JSON.stringify({ op: 'flush', id }))))
  const payload = await answered
  pending.delete(id)
  return BigInt(String(payload.contentVersion ?? '0'))
}

function collabUrl(target: RoomTarget): string {
  // The internal address, not the one the browser uses: the browser goes
  // through the reverse proxy, and this process is inside it.
  const base =
    target.url ??
    process.env.GW_COLLAB_INTERNAL_URL ??
    `ws://127.0.0.1:${process.env.GW_COLLAB_PORT ?? 3001}${process.env.GW_COLLAB_PATH ?? '/collab'}`

  const url = new URL(base)
  url.searchParams.set('workshop', target.workshopId)
  url.searchParams.set('day', target.dayId)
  return url.toString()
}

function frameSync(write: (encoder: encoding.Encoder) => void): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  write(encoder)
  return encoding.toUint8Array(encoder)
}

function frame(type: number, payload: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, type)
  encoding.writeVarUint8Array(encoder, payload)
  return encoding.toUint8Array(encoder)
}

function once(socket: WebSocket, event: 'open'): Promise<void> {
  return new Promise((resolve) => socket.once(event, () => resolve()))
}

async function withDeadline<T>(ms: number, run: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const expired = new Promise<never>((_, rejectExpired) => {
    timer = setTimeout(
      () => rejectExpired(new CollabUnavailableError(`keine Antwort nach ${ms} ms`)),
      ms,
    )
  })
  try {
    return await Promise.race([run(), expired])
  } finally {
    clearTimeout(timer)
  }
}
