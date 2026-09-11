import type * as Y from 'yjs'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { readBlocks, readDayFields, type RawBlock } from '@/domain/collab/doc'
import type { Tx } from '@/server/db'
import { cluster, moduleType, workshop, workshopDay, workshopModule } from '@/server/db/schema'
import { validateModuleDesc } from '@/domain/moduleType/validate'
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
  const descs = await validatedDescs(tx, modules)

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
        jsonDesc: descs.get(block.id) ?? {},
        parked: block.parked,
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
          // Left out entirely when the document's desc did not validate, so the
          // row keeps the last value that did. See validatedDescs.
          ...(descs.has(block.id) ? { jsonDesc: descs.get(block.id) } : {}),
          parked: block.parked,
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

/**
 * Validates every block's `desc` against its module type, on the way in.
 *
 * WHY HERE. The editor runs the same check in the browser for instant feedback,
 * and a server action re-runs it -- but the editor has not used that action
 * since the move to CRDT. Everything a person types now arrives through the
 * collaboration room and lands here, which made this the only place left where
 * a schema can still be enforced. Until now it simply was not: whatever the
 * document held went into the column.
 *
 * That matters beyond tidiness. `json_desc` is rendered, exported and handed to
 * MCP clients, and a module type's schema is what everything downstream assumes
 * about its shape.
 *
 * WHAT A FAILURE DOES. The id is left OUT of the returned map, and the caller
 * then omits the column from its update -- so the row keeps the last value that
 * did validate, and an insert gets `{}`. Rejecting the whole materialisation
 * would let one malformed block freeze a whole day for everybody in it, which
 * is the same reasoning as the orphaned-parent case above.
 *
 * The alternative -- write it anyway and log -- is not one: it is exactly the
 * state this function exists to end.
 */
async function validatedDescs(
  tx: Tx,
  modules: RawBlock[],
): Promise<Map<string, Record<string, unknown>>> {
  const valid = new Map<string, Record<string, unknown>>()

  const typeIds = [
    ...new Set(modules.map((m) => m.moduleTypeId).filter((id): id is string => !!id)),
  ]
  if (typeIds.length === 0) return valid

  const types = await tx
    .select({
      id: moduleType.id,
      schemaVersion: moduleType.schemaVersion,
      jsonSchema: moduleType.jsonSchema,
    })
    .from(moduleType)
    .where(inArray(moduleType.id, typeIds))

  const byId = new Map(types.map((type) => [type.id, type]))

  for (const block of modules) {
    const type = block.moduleTypeId ? byId.get(block.moduleTypeId) : undefined
    // A type that is not in this tenant is somebody else's problem -- the
    // composite foreign key will refuse the row, and inventing a validation
    // verdict here would only obscure that.
    if (!type) continue

    const result = validateModuleDesc(type, block.desc ?? {})
    if (result.ok) {
      valid.set(block.id, result.value)
      continue
    }

    // Read by an operator, not by a user: the person editing already saw the
    // browser refuse it, and anybody reaching this line got past that.
    console.warn('materialize: desc failed validation, keeping the stored value', {
      moduleId: block.id,
      moduleTypeId: block.moduleTypeId,
      // The key, not a sentence: this is a log, and an operator grepping for
      // `field.required` finds every instance across four languages.
      errors: result.errors.map((e) => `${e.path} ${e.messageKey}`),
    })
  }

  return valid
}
