import type * as Y from 'yjs'
import { and, asc, eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { assertWorkshopAccess, NotFoundError, VersionConflictError } from '@/domain/agenda/access'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import {
  addModuleBlock,
  parkedModules,
  patchBlock,
  removeBlock,
  snapshotModule,
} from '@/domain/collab/ops'
import { DayError, deleteDay } from '@/domain/workshop/days'
import { listDays } from '@/domain/workshop/days'
import { withTenant, type Actor, type Tx } from '@/server/db'
import { workshopModule } from '@/server/db/schema'
import { editInRoom, type RoomTarget } from './client'
import { loadDoc } from './store'

/**
 * What crosses from one day to another.
 *
 * The parking area belongs to the workshop: a block set aside on the first day
 * has to be within reach on the second. The days are not one document, though.
 * Each is its own room, written back to the tables by its own materialiser --
 * and that materialiser deletes every row of its day its document does not
 * hold. So a block cannot change its day; it has to be written into the one and
 * taken out of the other.
 *
 * WITH A NEW ID, on purpose. Keeping the id would leave one row claimed by two
 * materialisers for as long as both rooms are open, each writing its own day
 * into it and deleting it from the other's point of view. A fresh id makes the
 * two edits independent: the arriving copy is a new row, the leaving block an
 * ordinary deletion.
 *
 * IN THAT ORDER, on purpose too. Written into the new day first, taken out of
 * the old one second: if the second step fails the block exists twice, which
 * somebody can see and delete. The other order would lose it.
 *
 * Every function here opens rooms, and none of them may be called while a
 * transaction holds the workshop row: materialising takes that same lock.
 */

export type RoomEditor = <T>(
  dayId: string,
  edit: (doc: Y.Doc) => T,
) => Promise<{ result: T; contentVersion: bigint }>

/** Opens rooms with one credential -- a token, or the signed-in person's cookie. */
export function roomEditor(target: Omit<RoomTarget, 'dayId'>): RoomEditor {
  return (dayId, edit) => editInRoom({ ...target, dayId }, edit)
}

export type ModuleMove = {
  moduleId: string
  fromDayId: string
  toDayId: string
  /** Where it lands: in the schedule (false) or on the shelf (true). Unchanged when absent. */
  parked?: boolean
}

/**
 * Moves one block to the end of another day.
 *
 * Both days must already be known to belong to the workshop the editor was made
 * for; the room refuses one that does not, but as an unavailable service rather
 * than as a missing day.
 */
export async function moveModuleToDay(
  edit: RoomEditor,
  { moduleId, fromDayId, toDayId, parked }: ModuleMove,
): Promise<{ moduleId: string; contentVersion: bigint }> {
  if (fromDayId === toDayId) {
    const { result, contentVersion } = await edit(fromDayId, (doc) => {
      if (!snapshotModule(doc, moduleId)) return false
      if (parked !== undefined) patchBlock(doc, moduleId, { parked })
      return true
    })
    if (!result) throw new NotFoundError()
    return { moduleId, contentVersion }
  }

  const { result: snapshot } = await edit(fromDayId, (doc) => snapshotModule(doc, moduleId))
  if (!snapshot) throw new NotFoundError()

  const arrived = uuidv7()
  await edit(toDayId, (doc) =>
    addModuleBlock(doc, arrived, {
      ...snapshot,
      parentId: null,
      parked: parked ?? snapshot.parked,
    }),
  )
  const { contentVersion } = await edit(fromDayId, (doc) => removeBlock(doc, moduleId))

  return { moduleId: arrived, contentVersion }
}

export type ParkedBlock = {
  id: string
  dayId: string
  title: string
  durationMinutes: number
  moduleTypeId: string
}

/**
 * The shelf as seen from one day: what is parked on every other day.
 *
 * Read from each day's shared document where there is one, and from the tables
 * only where there is not. The tables catch up a few seconds behind the room,
 * and somebody who parks a block and switches to the next day at once is
 * exactly the person this shelf is for.
 *
 * The caller has checked read access to the workshop.
 */
export async function parkedElsewhere(
  tx: Tx,
  workshopId: string,
  exceptDayId: string,
): Promise<ParkedBlock[]> {
  const out: ParkedBlock[] = []

  for (const day of await listDays(tx, workshopId)) {
    if (day.id === exceptDayId) continue

    const { doc, rows } = await loadDoc(tx, day.id)
    if (rows > 0) {
      for (const block of parkedModules(doc)) {
        out.push({
          id: block.id,
          dayId: day.id,
          title: block.title,
          durationMinutes: block.durationMinutes,
          moduleTypeId: block.moduleTypeId,
        })
      }
      doc.destroy()
      continue
    }
    doc.destroy()

    const stored = await tx
      .select({
        id: workshopModule.id,
        title: workshopModule.title,
        durationMinutes: workshopModule.durationMinutes,
        moduleTypeId: workshopModule.moduleTypeId,
      })
      .from(workshopModule)
      .where(and(eq(workshopModule.dayId, day.id), eq(workshopModule.parked, true)))
      .orderBy(asc(workshopModule.position), asc(workshopModule.id))
    for (const block of stored) out.push({ ...block, dayId: day.id })
  }

  return out
}

/**
 * Deletes a day, and moves what is parked on it to the day before it (or the
 * one after, when it was the first).
 *
 * The schedule of a deleted day goes with it -- that is what deleting a day
 * means. Its shelf does not: parked blocks belong to the workshop, and a
 * person tidying away a day they no longer need has not decided anything about
 * the alternatives they kept for the whole workshop.
 */
export async function deleteDayKeepingParked(
  actor: Actor,
  edit: RoomEditor,
  {
    workshopId,
    dayId,
    expectedVersion,
  }: { workshopId: string; dayId: string; expectedVersion?: bigint },
): Promise<{ contentVersion: bigint; rescued: number; remainingDayId: string }> {
  // Every refusal before any room is opened: a stale version or the last day
  // must not leave copies of blocks behind on another day.
  const remainingDayId = await withTenant(actor, async (tx) => {
    const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
    if (expectedVersion !== undefined && expectedVersion !== access.contentVersion) {
      throw new VersionConflictError(expectedVersion, access.contentVersion)
    }
    await assertDayInWorkshop(tx, access, dayId)

    const days = await listDays(tx, workshopId)
    if (days.length <= 1) throw new DayError('workshop.lastDay')
    const index = days.findIndex((day) => day.id === dayId)
    return (days[index - 1] ?? days[index + 1])!.id
  })

  const { result: parked } = await edit(dayId, (doc) => parkedModules(doc))
  if (parked.length > 0) {
    await edit(remainingDayId, (doc) =>
      doc.transact(() => {
        for (const block of parked) {
          addModuleBlock(doc, uuidv7(), { ...block, parentId: null, parked: true })
        }
      }),
    )
  }

  const contentVersion = await withTenant(actor, async (tx) =>
    deleteDay(
      tx,
      await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write'),
      dayId,
    ),
  )

  return { contentVersion, rescued: parked.length, remainingDayId }
}
