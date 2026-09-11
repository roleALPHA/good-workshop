import type * as Y from 'yjs'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { readBlocks, readDayFields, type RawBlock } from '@/domain/collab/doc'
import type { Tx } from '@/server/db'
import { cluster, workshop, workshopDay, workshopModule } from '@/server/db/schema'
import { loadDoc, readState, writeState } from './store'

/**
 * Folds the CRDT back into the relational tables.
 *
 * This is the architectural decision the whole feature rests on: **Yjs is the
 * editing layer, Postgres is the record.** Export, print, the MCP tools and
 * every server action read the relational tables and know nothing about a CRDT.
 * Making Yjs the source of truth instead would mean every one of those either
 * loading a document and replaying a log, or reading a second, drifting copy.
 *
 * The consequence to be honest about: the tables lag the live editors by a
 * moment. That is fine for reading, exporting and printing -- and it is why
 * `collab_state.materialized_up_to` exists, so "how far behind is it" is a
 * question with an answer rather than a matter of trust.
 */

export type MaterializeResult = {
  status: 'written' | 'unchanged' | 'no_state'
  blocks?: number
  removed?: number
  contentVersion?: bigint
}

export async function materializeDay(
  tx: Tx,
  workshopId: string,
  dayId: string,
  options: { force?: boolean } = {},
): Promise<MaterializeResult> {
  const { doc, upTo, rows } = await loadDoc(tx, dayId)
  if (rows === 0) return { status: 'no_state' }

  const already = await readState(tx, dayId)
  if (!options.force && already >= upTo) return { status: 'unchanged' }

  // The same row lock every structural edit takes. Materialising is a
  // structural edit -- it just happens to originate from a CRDT rather than
  // from a click.
  const locked = await tx
    .select({ contentVersion: workshop.contentVersion })
    .from(workshop)
    .where(eq(workshop.id, workshopId))
    .limit(1)
    .for('update')
  if (!locked[0]) throw new Error('Workshop nicht gefunden.')

  const blocks = readBlocks(doc)
  const written = await writeBlocks(tx, workshopId, dayId, blocks)

  const day = readDayFields(doc)
  await tx
    .update(workshopDay)
    .set({
      startTime: toTime(day.startMinute),
      title: day.title,
      jsonDesc: day.desc,
      updatedAt: sql`now()`,
    })
    .where(eq(workshopDay.id, dayId))

  const bumped = await tx
    .update(workshop)
    .set({ contentVersion: sql`${workshop.contentVersion} + 1`, updatedAt: sql`now()` })
    .where(eq(workshop.id, workshopId))
    .returning({ contentVersion: workshop.contentVersion })

  await writeState(tx, dayId, upTo)

  return {
    status: 'written',
    blocks: written.upserted,
    removed: written.removed,
    contentVersion: bumped[0]!.contentVersion,
  }
}

async function writeBlocks(
  tx: Tx,
  workshopId: string,
  dayId: string,
  blocks: RawBlock[],
): Promise<{ upserted: number; removed: number }> {
  const clusters = blocks.filter((b) => b.kind === 'cluster')
  const modules = blocks.filter((b) => b.kind === 'module' && b.moduleTypeId !== null)

  // Clusters first: a module's composite FK points at a cluster on the same
  // day, so the cluster has to exist before the module referencing it.
  for (const block of clusters) {
    await tx
      .insert(cluster)
      .values({
        id: block.id,
        workshopId,
        dayId,
        title: block.title,
        color: block.color,
        position: block.position,
        pinnedStartTime: block.pinnedStartMinute === null ? null : toTime(block.pinnedStartMinute),
      })
      .onConflictDoUpdate({
        target: cluster.id,
        set: {
          title: block.title,
          color: block.color,
          position: block.position,
          pinnedStartTime:
            block.pinnedStartMinute === null ? null : toTime(block.pinnedStartMinute),
          updatedAt: sql`now()`,
        },
      })
  }

  const clusterIds = new Set(clusters.map((c) => c.id))

  for (const block of modules) {
    // A parent that no longer exists means the cluster was deleted while this
    // module was being moved into it. Landing it on the day is the
    // recoverable outcome; the composite FK would otherwise reject the write
    // and the whole materialisation would fail for one orphan.
    const parentId =
      block.parentId !== null && clusterIds.has(block.parentId) ? block.parentId : null

    await tx
      .insert(workshopModule)
      .values({
        id: block.id,
        workshopId,
        dayId,
        clusterId: parentId,
        moduleTypeId: block.moduleTypeId!,
        title: block.title,
        durationMinutes: block.durationMinutes,
        pinnedStartTime: block.pinnedStartMinute === null ? null : toTime(block.pinnedStartMinute),
        jsonDesc: block.desc,
        position: block.position,
      })
      .onConflictDoUpdate({
        target: workshopModule.id,
        set: {
          clusterId: parentId,
          title: block.title,
          durationMinutes: block.durationMinutes,
          pinnedStartTime:
            block.pinnedStartMinute === null ? null : toTime(block.pinnedStartMinute),
          jsonDesc: block.desc,
          position: block.position,
          updatedAt: sql`now()`,
        },
      })
  }

  // Anything the CRDT no longer holds was deleted by somebody. Modules before
  // clusters, so a cluster is never removed while a row still points at it.
  const moduleIds = modules.map((m) => m.id)
  const removedModules = await tx
    .delete(workshopModule)
    .where(
      moduleIds.length > 0
        ? and(eq(workshopModule.dayId, dayId), notInArray(workshopModule.id, moduleIds))
        : eq(workshopModule.dayId, dayId),
    )
    .returning({ id: workshopModule.id })

  const clusterIdList = [...clusterIds]
  const removedClusters = await tx
    .delete(cluster)
    .where(
      clusterIdList.length > 0
        ? and(eq(cluster.dayId, dayId), notInArray(cluster.id, clusterIdList))
        : eq(cluster.dayId, dayId),
    )
    .returning({ id: cluster.id })

  return {
    upserted: clusters.length + modules.length,
    removed: removedModules.length + removedClusters.length,
  }
}

const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`

// Kept for the day the materialiser needs to narrow by id rather than by day.
void inArray

/** Convenience for callers that hold a Y.Doc already (the collab server). */
export type DocSource = { doc: Y.Doc; upTo: number }
