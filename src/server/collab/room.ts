import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import type { Actor } from '@/server/db'
import { withTenant } from '@/server/db'
import { materializeDay } from './materialize'
import { appendUpdate, loadDoc, maybeCompact } from './store'

/**
 * One open workshop day, shared by everyone currently editing it.
 *
 * A room exists only while somebody is connected. Its document is authoritative
 * for the duration -- clients sync against it, not against each other -- and
 * everything it accumulates is written to the append-only log as it happens.
 * The relational tables are brought in line separately, on a timer, because
 * that is a heavier write and nobody is waiting for it.
 */

export type Connection = {
  send: (data: Uint8Array) => void
  close: () => void
  /** Awareness client id, so this connection's presence can be cleared on leave. */
  awarenessId?: number
}

/**
 * Timings, configurable so they can be tested.
 *
 * A thirty-second grace period hard-coded into the class makes the "reconnect
 * keeps the room alive" behaviour unverifiable except by waiting thirty
 * seconds -- which means in practice it would never be verified at all.
 */
export type RoomTimings = {
  /** Persisting on every keystroke would turn one sentence into forty rows. */
  persistDebounceMs: number
  /** The heavier write, and nothing is waiting on it. */
  materializeDebounceMs: number
  /** How long an empty room lingers before it is torn down. */
  emptyGraceMs: number
}

export const DEFAULT_TIMINGS: RoomTimings = {
  persistDebounceMs: 400,
  materializeDebounceMs: 3_000,
  emptyGraceMs: 30_000,
}

export class Room {
  readonly doc = new Y.Doc()
  readonly awareness = new Awareness(this.doc)
  readonly connections = new Set<Connection>()

  private pendingUpdates: Uint8Array[] = []
  private persistTimer: NodeJS.Timeout | null = null
  private materializeTimer: NodeJS.Timeout | null = null
  private teardownTimer: NodeJS.Timeout | null = null
  private loaded = false

  constructor(
    readonly workshopId: string,
    readonly dayId: string,
    private readonly actor: Actor,
    private readonly onEmpty: () => void,
    private readonly timings: RoomTimings = DEFAULT_TIMINGS,
  ) {
    // Local awareness state would be broadcast as if a phantom user were
    // present; the room itself is not a participant.
    this.awareness.setLocalState(null)

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // Updates that came from replaying the log are already persisted.
      if (origin === 'load') return
      this.pendingUpdates.push(update)
      this.schedulePersist()
    })
  }

  /** Replays the stored log. Called once, before any client is served. */
  async load(): Promise<void> {
    if (this.loaded) return
    const stored = await withTenant(this.actor, (tx) => loadDoc(tx, this.dayId))
    Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(stored.doc), 'load')
    this.loaded = true
  }

  add(connection: Connection): void {
    if (this.teardownTimer) {
      clearTimeout(this.teardownTimer)
      this.teardownTimer = null
    }
    this.connections.add(connection)
  }

  remove(connection: Connection): void {
    this.connections.delete(connection)

    if (connection.awarenessId !== undefined) {
      // Otherwise a disconnected editor keeps a cursor on the page forever.
      removeAwarenessStates(this.awareness, [connection.awarenessId], 'disconnect')
      this.broadcastAwareness([connection.awarenessId])
    }

    if (this.connections.size > 0) return

    // A grace period rather than immediate teardown: a reload disconnects and
    // reconnects within a second, and replaying the whole log for that is waste.
    this.teardownTimer = setTimeout(() => {
      void this.flush().finally(this.onEmpty)
    }, this.timings.emptyGraceMs)
  }

  broadcast(message: Uint8Array, except?: Connection): void {
    for (const connection of this.connections) {
      if (connection === except) continue
      try {
        connection.send(message)
      } catch {
        // A dead socket is removed by its own close handler; failing here must
        // not stop the message reaching everyone else.
      }
    }
  }

  applyAwareness(update: Uint8Array, origin: Connection): void {
    applyAwarenessUpdate(this.awareness, update, origin)
  }

  broadcastAwareness(clients: number[]): void {
    if (clients.length === 0) return
    this.broadcast(encodeAwarenessMessage(this.awareness, clients))
  }

  /**
   * Two independent debounces, and they must stay independent.
   *
   * An earlier version returned early when a persist was already pending --
   * which also skipped scheduling the materialisation. Updates arriving close
   * together then had only the FIRST one schedule it, so a block added just
   * after the day was seeded stayed out of the relational tables until the
   * room closed. Exports and the print view showed an empty day for as long as
   * somebody kept editing.
   */
  private schedulePersist(): void {
    if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null
        void this.persist()
      }, this.timings.persistDebounceMs)
    }

    if (!this.materializeTimer) {
      this.materializeTimer = setTimeout(() => {
        this.materializeTimer = null
        void this.materialize()
      }, this.timings.materializeDebounceMs)
    }
  }

  private async persist(): Promise<void> {
    const batch = this.pendingUpdates
    if (batch.length === 0) return
    this.pendingUpdates = []

    try {
      // Merged into one row: forty keystrokes are one edit as far as storage
      // is concerned, and replaying forty rows later costs the same as one.
      const merged = Y.mergeUpdates(batch)
      await withTenant(this.actor, async (tx) => {
        await appendUpdate(tx, this.dayId, merged)
        await maybeCompact(tx, this.dayId)
      })
    } catch (error) {
      // Put them back: losing an update means losing somebody's work, and the
      // next flush is a better place to fail than this one.
      this.pendingUpdates.unshift(...batch)
      console.error('collab: persist failed', { dayId: this.dayId, error })
    }
  }

  private async materialize(): Promise<void> {
    try {
      await withTenant(this.actor, (tx) => materializeDay(tx, this.workshopId, this.dayId))
    } catch (error) {
      // Never fatal: the log is the durable record, and the tables catch up on
      // the next attempt or when the room closes.
      console.error('collab: materialise failed', { dayId: this.dayId, error })
    }
  }

  /** Writes everything out. Called when the last editor leaves. */
  async flush(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    if (this.materializeTimer) clearTimeout(this.materializeTimer)
    this.persistTimer = null
    this.materializeTimer = null

    await this.persist()
    await this.materialize()
    this.doc.destroy()
  }
}

function encodeAwarenessMessage(awareness: Awareness, clients: number[]): Uint8Array {
  return encodeAwarenessUpdate(awareness, clients)
}
