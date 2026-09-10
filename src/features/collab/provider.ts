'use client'

import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'

/**
 * The browser half of the collaboration connection.
 *
 * Hand-written rather than pulled from y-websocket, for one reason that
 * matters: reconnection behaviour. An off-the-shelf provider reconnects
 * forever with its own opinions about timing; here the backoff is explicit,
 * bounded, and reports what it is doing, so the editor can tell a person
 * "offline, trying again" instead of quietly going stale.
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 15_000

export type ConnectionState = 'connecting' | 'connected' | 'offline'

export type ProviderEvents = {
  onState?: (state: ConnectionState) => void
  onPeers?: (peers: PeerPresence[]) => void
  onSynced?: () => void
  /** True while bytes are still queued in the socket. */
  onPending?: (pending: boolean) => void
}

export type PeerPresence = {
  clientId: number
  name: string
  color: string
  /** Which block they have focused, if any. */
  focusedBlockId?: string | null
}

export type LocalPresence = { name: string; color: string }

export class CollabProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness

  private socket: WebSocket | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private synced = false
  private pending = false
  private pendingTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly url: string,
    private readonly presence: LocalPresence,
    private readonly events: ProviderEvents = {},
    doc?: Y.Doc,
  ) {
    this.doc = doc ?? new Y.Doc()
    this.awareness = new Awareness(this.doc)
    this.awareness.setLocalStateField('user', presence)

    this.doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)

    // A tab that closes without clearing its presence leaves a ghost cursor
    // behind for everyone else until the server times it out.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.onBeforeUnload)
    }

    this.connect()
  }

  setFocus(blockId: string | null): void {
    this.awareness.setLocalStateField('focusedBlockId', blockId)
  }

  peers(): PeerPresence[] {
    const out: PeerPresence[] = []
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.awareness.clientID) return
      const user = (state as { user?: LocalPresence }).user
      if (!user) return
      out.push({
        clientId,
        name: user.name,
        color: user.color,
        focusedBlockId: (state as { focusedBlockId?: string | null }).focusedBlockId ?? null,
      })
    })
    return out
  }

  destroy(): void {
    this.destroyed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.clearPresence()
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    if (this.pendingTimer) clearInterval(this.pendingTimer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.onBeforeUnload)
    }
    this.socket?.close()
    this.socket = null
  }

  private clearPresence = () => {
    removeAwarenessStates(this.awareness, [this.awareness.clientID], 'unload')
  }

  /**
   * Warns before leaving with bytes still queued.
   *
   * Calling send() only hands data to the socket; a reload a moment later can
   * take it with it. The browser's own dialog is the only thing that can
   * interrupt a navigation, which makes this the one place a modal is right.
   */
  private onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.socket && this.socket.bufferedAmount > 0) event.preventDefault()
    this.clearPresence()
  }

  /**
   * Watches the send buffer.
   *
   * WebSocket gives no acknowledgement, so "has my change left this machine"
   * is only answerable through bufferedAmount. Polling it is unlovely and it is
   * the only honest signal available -- the alternative is an indicator that
   * says "saved" without knowing.
   */
  private trackPending(): void {
    if (this.pendingTimer) return
    this.pendingTimer = setInterval(() => {
      const pending = (this.socket?.bufferedAmount ?? 0) > 0
      if (pending === this.pending) return
      this.pending = pending
      this.events.onPending?.(pending)
    }, 60)
  }

  private connect(): void {
    if (this.destroyed) return
    this.events.onState?.(this.synced ? 'connecting' : 'connecting')

    const socket = new WebSocket(this.url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0
      this.events.onState?.('connected')
      this.trackPending()

      // Both sides announce what they have. Without the client's own step 1 it
      // never learns the server's state, and a freshly opened day looks empty.
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(encoder, this.doc)
      socket.send(encoding.toUint8Array(encoder))

      const states = [...this.awareness.getStates().keys()]
      if (states.length > 0) {
        socket.send(this.awarenessMessage(encodeAwarenessUpdate(this.awareness, states)))
      }
    })

    socket.addEventListener('message', (event) => {
      this.handleMessage(new Uint8Array(event.data as ArrayBuffer))
    })

    socket.addEventListener('close', () => {
      this.socket = null
      if (this.destroyed) return

      // Everyone else's cursors are stale the moment the connection drops.
      removeAwarenessStates(
        this.awareness,
        [...this.awareness.getStates().keys()].filter((id) => id !== this.awareness.clientID),
        'disconnect',
      )
      this.events.onPeers?.(this.peers())
      this.events.onState?.('offline')
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => socket.close())
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return

    // Exponential with a ceiling: a server that is down for a minute must not
    // be hammered, and a laptop coming out of sleep must not wait ten minutes.
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS)
    this.reconnectAttempt += 1

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private handleMessage(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)

    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, 'remote')

      if (encoding.length(encoder) > 1) this.socket?.send(encoding.toUint8Array(encoder))

      if (!this.synced) {
        this.synced = true
        this.events.onSynced?.()
      }
      return
    }

    if (type === MESSAGE_AWARENESS) {
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), 'remote')
      this.events.onPeers?.(this.peers())
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Never echo back what the server just told us.
    if (origin === 'remote') return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.socket?.send(encoding.toUint8Array(encoder))

    if (!this.pending) {
      this.pending = true
      this.events.onPending?.(true)
    }
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== 'remote') {
      const changed = [...added, ...updated, ...removed]
      if (changed.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(this.awarenessMessage(encodeAwarenessUpdate(this.awareness, changed)))
      }
    }
    this.events.onPeers?.(this.peers())
  }

  private awarenessMessage(payload: Uint8Array): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(encoder, payload)
    return encoding.toUint8Array(encoder)
  }
}
