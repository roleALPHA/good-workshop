import { uuidv7 } from 'uuidv7'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { memberIdOf, type Actor, type Tx } from '@/server/db'
import { folder, member, workshop, workshopDay } from '@/server/db/schema'
import { keyAtEnd } from '@/domain/agenda/ordering'
import { DomainError } from '@/domain/errors'
import { type WorkshopAccess } from '@/domain/agenda/access'

/**
 * The workshop itself: creating one, renaming it, moving it, and the three states
 * of removing it -- bin, restore, delete for good.
 *
 * Deleting is deliberately two decisions. The bin is a column rather than a copy
 * somewhere else, so restoring is the same row with the same ids: a link somebody
 * mailed still works afterwards, and nothing has to be recoverable without a
 * database restore.
 *
 * Reading the library is in ./library.ts, the folder tree in ./folders.ts, the
 * days of a workshop in ./days.ts.
 */

export type NewWorkshop = { title: string; folderId?: string | null; date?: string | null }

/**
 * Creates a workshop with its first day already in place.
 *
 * A workshop without a day is a dead end -- there is nothing to open and
 * nothing to plan -- so the two are never separate steps.
 */
export async function createWorkshop(
  tx: Tx,
  actor: Actor,
  input: NewWorkshop,
): Promise<{ workshopId: string; dayId: string }> {
  const memberships = await tx
    .select({ id: member.id })
    .from(member)
    .where(eq(member.id, memberIdOf(actor)))
    .limit(1)
  if (!memberships[0]) throw new Error('membership row missing for the current actor')

  if (input.folderId) {
    // Named rather than left to the composite foreign key, whose violation
    // reaches a person -- or a model choosing an id -- as "the call failed".
    const folders = await tx
      .select({ id: folder.id })
      .from(folder)
      .where(eq(folder.id, input.folderId))
      .limit(1)
    if (!folders[0]) throw new WorkshopFolderError('folder.targetGone')
  }

  const siblings = await tx
    .select({ id: workshop.id, position: workshop.position })
    .from(workshop)
    .where(isNull(workshop.deletedAt))

  const workshopId = uuidv7()
  const dayId = uuidv7()

  await tx.insert(workshop).values({
    id: workshopId,
    title: input.title,
    folderId: input.folderId ?? null,
    ownerId: memberIdOf(actor),
    position: keyAtEnd(siblings),
    createdBy: actor.memberId,
    updatedBy: actor.memberId,
  })

  await tx.insert(workshopDay).values({
    id: dayId,
    workshopId,
    title: 'Tag 1',
    date: input.date ?? null,
    position: keyAtEnd([]),
  })

  return { workshopId, dayId }
}

export async function renameWorkshop(tx: Tx, access: WorkshopAccess, title: string): Promise<void> {
  await tx
    .update(workshop)
    .set({ title, updatedAt: sql`now()`, updatedBy: access.actor.memberId })
    .where(eq(workshop.id, access.workshopId))
}

/**
 * Soft delete: the row stays, `deleted_at` is set.
 *
 * The only table in the schema that works this way, and deliberately so -- a
 * workshop represents weeks of preparation, and "I deleted the wrong one" has
 * to be recoverable without a database restore.
 */
export async function trashWorkshop(tx: Tx, access: WorkshopAccess): Promise<void> {
  await tx
    .update(workshop)
    .set({ deletedAt: sql`now()`, updatedBy: access.actor.memberId })
    .where(eq(workshop.id, access.workshopId))
}

/**
 * Puts a workshop back where it was.
 *
 * Nothing else changes -- it kept its folder, its tags and its collaborators
 * while it sat in the bin, because the row never went anywhere.
 */
export async function restoreWorkshop(tx: Tx, access: WorkshopAccess): Promise<void> {
  await tx
    .update(workshop)
    .set({ deletedAt: null, updatedBy: access.actor.memberId })
    .where(eq(workshop.id, access.workshopId))
}

export class WorkshopFolderError extends DomainError {}

/**
 * Files a workshop in a folder, or takes it out of all of them.
 *
 * Deliberately NOT a change to `updated_at`. The library is sorted by it, so
 * bumping it would send every filed workshop to the top of the list -- somebody
 * tidying ten of them away would watch the list rebuild itself ten times, and
 * each row would move for a reason that has nothing to do with what they did.
 * Filing is about where a workshop sits, not about what it says. `trashWorkshop`
 * and `restoreWorkshop` above draw the same line for the same reason.
 *
 * `position` is left alone as well: for workshops the column is written at
 * insert and read by nothing. Writing a key here would invent an order the rest
 * of the system does not honour.
 */
export async function moveWorkshopToFolder(
  tx: Tx,
  access: WorkshopAccess,
  folderId: string | null,
): Promise<void> {
  if (folderId !== null) {
    // RLS hides another tenant's folders, so "no row" covers both "gone" and
    // "not yours" -- and it answers before the composite foreign key can fail
    // in a way nobody can read.
    const rows = await tx
      .select({ id: folder.id })
      .from(folder)
      .where(eq(folder.id, folderId))
      .limit(1)
    if (!rows[0]) throw new WorkshopFolderError('folder.targetGone')
  }

  // No existence check on the workshop: assertWorkshopAccess already found the
  // row, excluded trashed ones and took FOR UPDATE on it. The access token is
  // the proof. renameWorkshop relies on the same thing.
  await tx
    .update(workshop)
    .set({ folderId, updatedBy: access.actor.memberId })
    .where(eq(workshop.id, access.workshopId))
}

/**
 * The one irreversible operation in the application.
 *
 * Only from the bin, never straight from the library: `deleted_at` has to be
 * set already, so "delete" and "delete for good" are two decisions taken at two
 * moments. Days, blocks, tags and shares go with it through the foreign keys.
 */
export async function purgeWorkshop(tx: Tx, access: WorkshopAccess): Promise<number> {
  const rows = await tx
    .delete(workshop)
    .where(and(eq(workshop.id, access.workshopId), isNotNull(workshop.deletedAt)))
    .returning({ id: workshop.id })
  return rows.length
}
