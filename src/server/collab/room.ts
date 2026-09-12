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
import { authoritativePresence, type PresenceActor } from '@/domain/collab/presence'
import { eq } from 'drizzle-orm'
import type { Actor } from '@/server/db'
import { withTenant } from '@/server/db'
import { workshop } from '@/server/db/schema'
import { materializeDay } from './materialize'
import { appendUpdate, loadDoc, maybeCompact } from './store'
import { DEFAULT_LOCALE } from '@/i18n/config'

/**
 * Decode, replace the identity, re-encode.
 *
 * A scratch Awareness over a throwaway document rather than the room's own:
 * applying the client's update to the room first is exactly what has to be
 * avoided, and reading the room's states would mix in every other peer.
 */
function authoritative(update: Uint8Array, actor: PresenceActor): Uint8Array {
  const scratch = new Awareness(new Y.Doc())
  try {
    applyAwarenessUpdate(scratch, update, 'rewrite')

    const clients = [...scratch.getStates().keys()]
    for (const client of clients) {
      const state = scratch.getStates().get(client)
      if (!state) continue
      state.user = authoritativePresence(
        state.user as { name?: string; hue?: number; kind?: 'person' | 'model' } | undefined,
        actor,
      )
    }

    return encodeAwarenessUpdate(scratch, clients)
  } finally {
    scratch.destroy()
  }
}

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
  /**
   * Bumped on every join, and captured by a teardown before it starts writing.
   *
   * A teardown that has already begun cannot be called back -- `flush()` is in
   * flight against Postgres -- but it can be disowned. Comparing the captured
   * generation against the current one at the end is what tells it whether the
   * room it was closing is still the room that exists.
   */
  private generation = 0
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
      /**
       * The locale is irrelevant here, and it is worth saying why rather than
       * leaving DEFAULT_LOCALE looking like a shortcut.
       *
       * seedFromDayDoc copies the day's fields and its blocks into the CRDT --
       * and of a block only its `moduleTypeId`. The localised `moduleTypes` map
       * this returns is dropped on the floor. Which is the right shape: the
       * shared document is one per day and its readers are several people with
       * possibly different languages, so a translated name in there would be
       * one language baked into state everybody shares.
       */
      const { doc } = await loadDay(tx, access, this.dayId, DEFAULT_LOCALE)
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
    // Cancelling the timer is not enough on its own: if it has already fired,
    // a flush is running and will otherwise destroy the document under this
    // connection. See `generation`.
    this.generation += 1
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
    this.teardownTimer = setTimeout(() => this.teardown(), this.timings.emptyGraceMs)
  }

  /**
   * Write everything out, then close the room -- unless somebody arrived.
   *
   * The gap between the two is not small. `flush()` ends in `materializeDay`,
   * which takes the same `FOR UPDATE` on the workshop row that every
   * structural edit takes, so under a handful of concurrently closing rooms it
   * waits on the other ones. The room stays in the registry for that whole
   * time and a connection landing in it is served normally -- so destroying
   * the document afterwards left that client on an open socket to a dead
   * document while the next arrival built a second room. The two never saw
   * each other again, and nothing in the protocol or the UI said so.
   */
  private teardown(): void {
    this.teardownTimer = null
    const generation = this.generation

    void this.flush().finally(() => {
      // Somebody joined while we were writing. The write was still right; the
      // closing is not, and the registry entry has to stay too.
      if (generation !== this.generation) return
      this.doc.destroy()
      this.onEmpty()
    })
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

  /**
   * Awareness from a client, with the identity replaced by the one the server
   * established at the handshake.
   *
   * Rewritten BEFORE it is applied, not after. `applyAwarenessUpdate` fires its
   * 'update' event synchronously, and that event is what broadcasts to the
   * other peers -- so correcting the stored state afterwards would send the
   * forged version first and fix it for nobody.
   *
   * The rewrite covers whatever client id the connection writes, including
   * somebody else's: a connection can only ever publish its own identity.
   */
  applyAwareness(update: Uint8Array, origin: Connection, actor: PresenceActor): void {
    applyAwarenessUpdate(this.awareness, authoritative(update, actor), origin)
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

  /**
   * Writes everything out.
   *
   * Deliberately does NOT destroy the document: whether this room is finished
   * is decided after the write, by `teardown()`, because the write is long
   * enough for a new editor to arrive in the middle of it. Shutdown calls this
   * too, and there the process is about to exit anyway.
   */
  async flush(): Promise<void> {
    await this.flushNow()
  }
}

function encodeAwarenessMessage(awareness: Awareness, clients: number[]): Uint8Array {
  return encodeAwarenessUpdate(awareness, clients)
}
