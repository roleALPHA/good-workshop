import * as Y from 'yjs'
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import { collabState, collabUpdate } from '@/server/db/schema'

/**
 * Persistence for the CRDT log.
 *
 * Append-only, because appending is the only operation on a CRDT that never
 * needs coordination: two clients writing at the same moment simply both
 * insert, and the document is whatever the sum of the rows says it is.
 *
 * Compaction folds the log into a single row. It is an optimisation and never
 * a correctness requirement -- a log that is never compacted replays to
 * exactly the same document, just more slowly.
 */

/** Past this many rows, a read pays enough that folding them is worth a write. */
const COMPACT_THRESHOLD = 200

export type LoadedDoc = { doc: Y.Doc; upTo: number; rows: number }

/**
 * Replays the log into a document.
 *
 * Order matters and comes from the primary key: Yjs updates are commutative in
 * their effect, but replaying a snapshot after the updates it already contains
 * would be wasted work rather than wrong.
 */
export async function loadDoc(tx: Tx, dayId: string): Promise<LoadedDoc> {
  const rows = await tx
    .select({ id: collabUpdate.id, payload: collabUpdate.payload })
    .from(collabUpdate)
    .where(eq(collabUpdate.dayId, dayId))
    .orderBy(asc(collabUpdate.id))

  const doc = new Y.Doc()
  if (rows.length > 0) {
    // Applied as one transaction so observers see a single change rather than
    // one per historical update.
    doc.transact(() => {
      for (const row of rows) Y.applyUpdate(doc, new Uint8Array(row.payload))
    })
  }

  return { doc, upTo: rows.at(-1)?.id ?? 0, rows: rows.length }
}

export async function appendUpdate(
  tx: Tx,
  dayId: string,
  update: Uint8Array,
): Promise<{ id: number }> {
  const inserted = await tx
    .insert(collabUpdate)
    .values({ dayId, payload: Buffer.from(update) })
    .returning({ id: collabUpdate.id })

  return { id: inserted[0]!.id }
}

/**
 * Folds the log into one row.
 *
 * Deletes only up to the id that was read, never "everything": an update
 * appended while this was running must survive, and deleting past the read
 * point would drop it silently. That is the whole reason for the `upTo` bound.
 */
export async function compact(tx: Tx, dayId: string): Promise<{ compacted: number } | null> {
  const { doc, upTo, rows } = await loadDoc(tx, dayId)
  if (rows < COMPACT_THRESHOLD) return null

  const snapshot = Y.encodeStateAsUpdate(doc)

  await tx.insert(collabUpdate).values({
    dayId,
    payload: Buffer.from(snapshot),
    isSnapshot: true,
  })

  await tx
    .delete(collabUpdate)
    .where(and(eq(collabUpdate.dayId, dayId), lte(collabUpdate.id, upTo)))

  return { compacted: rows }
}

export async function maybeCompact(tx: Tx, dayId: string): Promise<void> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(collabUpdate)
    .where(eq(collabUpdate.dayId, dayId))

  if ((rows[0]?.count ?? 0) >= COMPACT_THRESHOLD) await compact(tx, dayId)
}

export async function readState(tx: Tx, dayId: string): Promise<number> {
  const rows = await tx
    .select({ upTo: collabState.materializedUpTo })
    .from(collabState)
    .where(eq(collabState.dayId, dayId))
    .limit(1)
  return rows[0]?.upTo ?? 0
}

export async function writeState(tx: Tx, dayId: string, upTo: number): Promise<void> {
  await tx
    .insert(collabState)
    .values({ dayId, materializedUpTo: upTo, materializedAt: sql`now()` })
    .onConflictDoUpdate({
      target: collabState.dayId,
      set: { materializedUpTo: upTo, materializedAt: sql`now()`, updatedAt: sql`now()` },
    })
}
