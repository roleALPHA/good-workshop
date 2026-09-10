import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { dayOf, seedFromDayDoc } from '@/domain/collab/doc'
import { eq } from 'drizzle-orm'
import type { Actor } from '@/server/db'
import { withTenant } from '@/server/db'
import { workshop } from '@/server/db/schema'
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
  private persisting: Promise<void> | null = null
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

  /**
   * Replays the stored log, and seeds from the relational day if there is none.
   *
   * Seeding belongs HERE and not in the browser. It used to happen on the
   * client, which was fine as long as a browser was the only thing that ever
   * opened a day -- but an LLM writing through MCP opens rooms too, and it
   * would have started from an empty document. The materialiser writes the
   * document back and deletes what it does not hold, so the first model write
   * to a day nobody had opened yet would have erased that day.
   *
   * The guard inside `seedFromDayDoc` is what makes this safe to call on every
   * load: a day that already has state keeps it.
   */
  async load(): Promise<void> {
    if (this.loaded) return

    await withTenant(this.actor, async (tx) => {
      const stored = await loadDoc(tx, this.dayId)
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(stored.doc), 'load')

      if (dayOf(this.doc).get('seeded') === true) return

      const access = await assertWorkshopAccess(tx, this.actor, this.workshopId, 'workshop.read')
      const { doc } = await loadDay(tx, access, this.dayId)
      // Deliberately not tagged 'load': this IS new state and has to reach the
      // log, or the next room would seed all over again.
      seedFromDayDoc(this.doc, doc)
    })

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

  /**
   * Appends what we hold to the log, one write at a time.
   *
   * Chained rather than concurrent: two appends in flight can land in either
   * order, and anything reading the log in between sees one with the middle
   * missing.
   */
  private persist(): Promise<void> {
    this.persisting = (this.persisting ?? Promise.resolve()).then(() => this.persistOnce())
    return this.persisting
  }

  private async persistOnce(): Promise<void> {
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
    // Everything we hold has to be in the log FIRST.
    //
    // Materialising reads the log back out of the database, so one that
    // overtakes its own persist finds nothing new, reports "unchanged" and
    // schedules nothing more. The tables then stay behind until the room
    // closes -- which, for a day somebody is still looking at, is never. The
    // symptom was an export that showed a completely empty day while the
    // editor showed a full one, and it read as "the first materialisation is
    // slow" because a later edit usually rescheduled one.
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    await this.persist()

    try {
      await withTenant(this.actor, (tx) => materializeDay(tx, this.workshopId, this.dayId))
    } catch (error) {
      // Never fatal: the log is the durable record, and the tables catch up on
      // the next attempt or when the room closes.
      console.error('collab: materialise failed', { dayId: this.dayId, error })
    }
  }

  /**
   * Writes everything out now and reports where the relational tables landed.
   *
   * The debounces exist because nobody is waiting for the tables -- except an
   * MCP client, which is. A model that writes a day and immediately reads it
   * back would otherwise get the state from before its own call, and would
   * either write it a second time or report to the user that nothing happened.
   * One explicit flush turns that into read-after-write.
   */
  async flushNow(): Promise<bigint> {
    if (this.materializeTimer) clearTimeout(this.materializeTimer)
    this.materializeTimer = null

    // Persisting is materialisation's own first step, so asking for it twice
    // here would only invite the two to drift apart later.
    await this.materialize()

    return withTenant(this.actor, async (tx) => {
      const row = await tx
        .select({ contentVersion: workshop.contentVersion })
        .from(workshop)
        .where(eq(workshop.id, this.workshopId))
        .limit(1)
      return row[0]?.contentVersion ?? 0n
    })
  }

  /** Writes everything out. Called when the last editor leaves. */
  async flush(): Promise<void> {
    await this.flushNow()
    this.doc.destroy()
  }
}

function encodeAwarenessMessage(awareness: Awareness, clients: number[]): Uint8Array {
  return encodeAwarenessUpdate(awareness, clients)
}
