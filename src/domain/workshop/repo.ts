import { uuidv7 } from 'uuidv7'
import { and, asc, desc, eq, ilike, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import {
  folder,
  member,
  tag,
  workshop,
  workshopCollaborator,
  workshopDay,
} from '@/server/db/schema'
import { keyAtEnd, placeAfter } from '@/domain/agenda/ordering'
import { NotFoundError, type WorkshopAccess } from '@/domain/agenda/access'
import { DomainError } from '@/domain/errors'

/**
 * The workshop library: folders, and the workshops inside them.
 *
 * Listing is the one place a per-workshop ACL cannot be a post-filter -- fetch
 * everything and drop what you may not see and the page sizes are wrong. It is
 * expressed as a join instead, so the database returns exactly what this member
 * is allowed to open.
 */

export type WorkshopTag = { id: string; name: string; color: string }

/**
 * The four values the `workshop_status` check constraint allows, as a type.
 *
 * It was `string`, which made every lookup keyed on it -- the status chip, now
 * the message catalog -- a lookup that could silently miss. The database has
 * always been this strict; the type simply did not say so.
 */
export const WORKSHOP_STATUSES = ['draft', 'ready', 'delivered', 'archived'] as const

export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number]

export type WorkshopSummary = {
  id: string
  title: string
  status: WorkshopStatus
  folderId: string | null
  updatedAt: Date
  dayCount: number
  tags: WorkshopTag[]
  role: 'owner' | 'editor' | 'viewer' | 'admin'
}

export type FolderNode = {
  id: string
  name: string
  parentId: string | null
  depth: number
  /**
   * The materialised path, root first.
   *
   * Carried out to the UI because the move menu has to leave a folder's own
   * subtree out of its options -- and asking "is this one below that one" is
   * exactly what the path answers. The domain refuses such a move as well; the
   * menu simply does not offer it.
   */
  ancestorIds: string[]
}

export async function listFolders(tx: Tx): Promise<FolderNode[]> {
  const rows = await tx
    .select({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      ancestors: folder.ancestorIds,
      position: folder.position,
    })
    .from(folder)
    .orderBy(asc(folder.position))

  // Sorted into tree order in memory: folder trees are hundreds of rows, and a
  // recursive CTE here would buy nothing but a harder query to read.
  const byParent = new Map<string | null, typeof rows>()
  for (const row of rows) {
    const bucket = byParent.get(row.parentId)
    if (bucket) bucket.push(row)
    else byParent.set(row.parentId, [row])
  }

  const out: FolderNode[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      out.push({
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        depth,
        ancestorIds: row.ancestors,
      })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
export type LibraryQuery = {
  folderId?: string | null
  tagId?: string
  /** Free text over the title. */
  search?: string
  /** From a previous page. */
  cursor?: string
  limit?: number
}

export type LibraryPage = {
  workshops: WorkshopSummary[]
  /** Opaque; pass it back to get the next page. Null when there is none. */
  nextCursor: string | null
}

const DEFAULT_LIMIT = 25

/**
 * The library, one page at a time.
 *
 * Visibility is a SQL predicate rather than a filter applied afterwards, and
 * that is what makes paging possible at all: filtering in JavaScript means a
 * page of twenty rows can yield three visible ones, so LIMIT would return
 * short pages and OFFSET would skip rows nobody ever saw.
 *
 * Keyset, not OFFSET. Somebody editing a workshop while you page through the
 * list moves it to the top, which with OFFSET silently shifts everything down
 * and hands you a row you already had -- or hides one you never saw.
 */
export async function listWorkshops(
  tx: Tx,
  actor: Actor,
  options: LibraryQuery = {},
): Promise<LibraryPage> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 100)
  const after = parseCursor(options.cursor)

  const rows = await tx
    .select({
      id: workshop.id,
      title: workshop.title,
      status: workshop.status,
      folderId: workshop.folderId,
      updatedAt: workshop.updatedAt,
      ownerId: workshop.ownerId,
      collaboratorRole: workshopCollaborator.role,
      dayCount: sql<number>`(
        select count(*)::int from ${workshopDay} d where d.workshop_id = ${workshop.id}
      )`,
      tags: sql<{ id: string; name: string; color: string }[]>`coalesce((
        select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                        order by t.name)
        from workshop_tag wt join tag t on t.id = wt.tag_id
        where wt.workshop_id = ${workshop.id}
      ), '[]'::json)`,
    })
    .from(workshop)
    .leftJoin(
      workshopCollaborator,
      and(
        eq(workshopCollaborator.workshopId, workshop.id),
        eq(workshopCollaborator.memberId, actor.memberId),
      ),
    )
    .where(
      and(
        isNull(workshop.deletedAt),
        visibleTo(actor),
        folderFilter(options.folderId),
        options.tagId
          ? sql`exists (select 1 from workshop_tag wt
                        where wt.workshop_id = ${workshop.id} and wt.tag_id = ${options.tagId})`
          : undefined,
        // ILIKE rather than a tsvector column: this is a title search over
        // hundreds to a few thousand rows, and a stemmed index would need a
        // migration to buy nothing here -- while making "strat" stop matching
        // "Strategie", which is what people actually type.
        options.search ? ilike(workshop.title, `%${escapeLike(options.search)}%`) : undefined,
        after
          ? sql`(${workshop.updatedAt}, ${workshop.id}) < (${after.updatedAt}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(desc(workshop.updatedAt), desc(workshop.id))
    .limit(limit + 1)

  // One row more than asked for is how "is there another page" is answered
  // without a second count query over the same predicate.
  const page = rows.slice(0, limit)
  const last = page.at(-1)

  return {
    workshops: page.map((row) => ({
      id: row.id,
      title: row.title,
      // Guaranteed by the workshop_status check constraint; drizzle types the
      // column as plain text.
      status: row.status as WorkshopStatus,
      folderId: row.folderId,
      updatedAt: row.updatedAt,
      dayCount: row.dayCount,
      tags: row.tags ?? [],
      role: roleOf(row.ownerId, row.collaboratorRole, actor),
    })),
    nextCursor: rows.length > limit && last ? makeCursor(last.updatedAt, last.id) : null,
  }
}

/**
 * Who may see a workshop, as a predicate.
 *
 * The same three rules `assertWorkshopAccess` applies to one workshop, said
 * once for a whole list. They have to agree: a row that shows up here and then
 * 404s when opened is a worse bug than either half alone.
 */
function visibleTo(actor: Actor) {
  if (actor.tenantRole === 'admin') return undefined
  return or(
    eq(workshop.ownerId, actor.memberId),
    sql`exists (select 1 from workshop_collaborator wc
                where wc.workshop_id = ${workshop.id} and wc.member_id = ${actor.memberId})`,
  )
}

function folderFilter(folderId: string | null | undefined) {
  if (folderId === undefined) return undefined
  return folderId === null ? isNull(workshop.folderId) : eq(workshop.folderId, folderId)
}

/** `%` and `_` are wildcards; somebody searching for them means the characters. */
const escapeLike = (input: string) => input.replace(/[\\%_]/g, (c) => `\\${c}`)

const makeCursor = (updatedAt: Date, id: string) =>
  Buffer.from(`${updatedAt.toISOString()}|${id}`).toString('base64url')

function parseCursor(cursor: string | undefined): { updatedAt: Date; id: string } | null {
  if (!cursor) return null
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    const updatedAt = new Date(iso ?? '')
    if (!id || Number.isNaN(updatedAt.getTime())) return null
    return { updatedAt, id }
  } catch {
    // A cursor is opaque to the client, so a broken one is a bad link rather
    // than a request worth failing: start from the top.
    return null
  }
}

/**
 * The role to show next to a row.
 *
 * Display only -- the predicate above already decided who sees what. Kept in
 * step with it deliberately: two answers to "may I open this" is how a list
 * ends up offering rows that 404.
 */
function roleOf(
  ownerId: string,
  collaboratorRole: string | null,
  actor: Actor,
): WorkshopSummary['role'] {
  if (ownerId === actor.memberId) return 'owner'
  if (collaboratorRole === 'editor' || collaboratorRole === 'viewer') return collaboratorRole
  return 'admin'
}

export type TagSummary = { id: string; name: string; color: string; count: number }

/** The tenant's tags, with how many workshops carry each. */
export async function listTags(tx: Tx): Promise<TagSummary[]> {
  const rows = await tx
    .select({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      count: sql<number>`(
        select count(*)::int from workshop_tag wt where wt.tag_id = ${tag.id}
      )`,
    })
    .from(tag)
    .orderBy(asc(tag.name))

  return rows
}

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
    .where(eq(member.id, actor.memberId))
    .limit(1)
  if (!memberships[0]) throw new Error('membership row missing for the current actor')

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
    ownerId: actor.memberId,
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

/** What is in the bin, newest first -- the order somebody looks for a mistake in. */
export async function listTrashedWorkshops(tx: Tx, actor: Actor) {
  return tx
    .select({
      id: workshop.id,
      title: workshop.title,
      deletedAt: workshop.deletedAt,
      ownerId: workshop.ownerId,
    })
    .from(workshop)
    .where(
      and(
        isNotNull(workshop.deletedAt),
        // Same visibility rule as the library: a tenant admin sees everything,
        // everybody else what they own or were given access to.
        actor.tenantRole === 'admin'
          ? undefined
          : or(
              eq(workshop.ownerId, actor.memberId),
              sql`exists (select 1 from ${workshopCollaborator} wc
                           where wc.workshop_id = ${workshop.id}
                             and wc.member_id = ${actor.memberId})`,
            ),
      ),
    )
    .orderBy(desc(workshop.deletedAt))
}

export class FolderMoveError extends DomainError {}

/**
 * Moves a folder, and the whole subtree under it, to a new parent.
 *
 * The materialised path is why this is more than an UPDATE of one column: every
 * descendant carries the full ancestor chain, so moving a folder rewrites the
 * prefix of that chain in every row below it. Left undone, the tree view would
 * still draw the old shape -- and `deleteFolder` would lift children to a
 * grandparent that is no longer above them.
 *
 * Refuses to move a folder into itself or into its own descendant. That is not
 * a theoretical case: it is what a drag onto the wrong row does, and the result
 * would be a cycle -- a subtree detached from the root, invisible in the
 * sidebar and unreachable except by id.
 *
 * `afterId` names the sibling the folder lands behind, null for first. An
 * anchor rather than an index, for the reason `placeAfter` documents: if a
 * sibling moved in the meantime you still land after the right neighbour.
 */
export async function moveFolder(
  tx: Tx,
  id: string,
  parentId: string | null,
  afterId: string | null = null,
): Promise<void> {
  const rows = await tx
    .select({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      ancestors: folder.ancestorIds,
    })
    .from(folder)
    .where(eq(folder.id, id))
    .limit(1)

  const moving = rows[0]
  if (!moving) throw new FolderMoveError('folder.gone')

  // Staying under the same parent is no longer nothing to do: it is how the
  // sidebar is put in order. Only the path rewrite below is skipped.
  const reparenting = moving.parentId !== parentId

  let ancestors: string[] = moving.ancestors
  if (reparenting) {
    ancestors = []
    if (parentId !== null) {
      if (parentId === id) throw new FolderMoveError('folder.intoItself')

      const targets = await tx
        .select({ ancestors: folder.ancestorIds })
        .from(folder)
        .where(eq(folder.id, parentId))
        .limit(1)

      const target = targets[0]
      if (!target) throw new FolderMoveError('folder.targetGone')
      if (target.ancestors.includes(id)) {
        throw new FolderMoveError('folder.intoOwnDescendant')
      }

      ancestors = [...target.ancestors, parentId]
    }

    // Asked before the write, because folder_sibling_name_uq would otherwise
    // answer with a unique violation that reaches the person as "something went
    // wrong". Two projects each holding an "Archiv" is the most ordinary folder
    // drag there is, and the name is something they can change.
    const clash = await tx
      .select({ id: folder.id })
      .from(folder)
      .where(
        and(
          sameParent(parentId),
          sql`lower(${folder.name}) = lower(${moving.name})`,
          ne(folder.id, id),
        ),
      )
      .limit(1)
    if (clash[0]) throw new FolderMoveError('folder.nameTaken')
  }

  if (reparenting) {
    // The descendants, read and rewritten one by one rather than with an array
    // expression built into the statement. A folder tree is hundreds of rows at
    // most -- the same reason listFolders sorts in memory -- and the alternative
    // meant interpolating ids into SQL text, which is a habit worth not having
    // in this codebase even where the values come from the database.
    const descendants = await tx
      .select({ id: folder.id, ancestors: folder.ancestorIds })
      .from(folder)
      .where(sql`${id}::uuid = any(${folder.ancestorIds})`)

    const newPath = [...ancestors, id]

    for (const row of descendants) {
      // Everything from the moved folder downwards is kept; what was above it is
      // replaced by the new location.
      const below = row.ancestors.slice(row.ancestors.indexOf(id) + 1)
      await tx
        .update(folder)
        .set({ ancestorIds: [...newPath, ...below] })
        .where(eq(folder.id, row.id))
    }
  }

  // Without this the folder keeps a key from the sibling list it came from and
  // lands among its new siblings at a spot nobody chose -- which, once a drag
  // makes moving cheap, reads as the feature being broken.
  const siblings = await tx
    .select({ id: folder.id, position: folder.position })
    .from(folder)
    .where(and(sameParent(parentId), ne(folder.id, id)))

  const placement = placeAfter(siblings, afterId)
  const position =
    placement.rebalance === null
      ? placement.position
      : await applyFolderRebalance(tx, placement.rebalance)

  await tx
    .update(folder)
    .set({ parentId, ancestorIds: ancestors, position })
    .where(eq(folder.id, id))
}

const sameParent = (parentId: string | null) =>
  parentId === null ? isNull(folder.parentId) : eq(folder.parentId, parentId)

/**
 * Spreads a sibling list out again and returns the slot left for the mover.
 *
 * `redistribute` marks that slot with an empty id -- the same contract
 * `applyRebalance` in the agenda repo reads. Rare and invisible: it only fires
 * after many insertions between the same two folders.
 */
async function applyFolderRebalance(
  tx: Tx,
  rebalance: { id: string; position: string }[],
): Promise<string> {
  let reserved = ''
  for (const row of rebalance) {
    if (row.id === '') {
      reserved = row.position
      continue
    }
    await tx.update(folder).set({ position: row.position }).where(eq(folder.id, row.id))
  }
  return reserved
}

/**
 * Removes a folder and lifts everything in it one level up.
 *
 * Deleting a folder is a decision about ORDER, not about content. Taking the
 * workshops with it would make tidying up the most expensive mistake in the
 * product -- and the person doing the tidying is rarely the one who wrote what
 * is inside.
 *
 * Every descendant is touched, not just the direct children: the materialised
 * path in `ancestor_ids` names this folder in every workshop below it, and a
 * path that mentions a folder which no longer exists breaks the tree view.
 */
export async function deleteFolder(tx: Tx, id: string): Promise<void> {
  const rows = await tx
    .select({ parentId: folder.parentId })
    .from(folder)
    .where(eq(folder.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) throw new NotFoundError()
  const parentId = found.parentId

  // The descendants keep their shape; they only lose this one ancestor.
  await tx
    .update(folder)
    .set({ ancestorIds: sql`array_remove(${folder.ancestorIds}, ${id}::uuid)` })
    .where(sql`${id}::uuid = any(${folder.ancestorIds})`)

  await tx.update(folder).set({ parentId }).where(eq(folder.parentId, id))
  await tx.update(workshop).set({ folderId: parentId }).where(eq(workshop.folderId, id))
  await tx.delete(folder).where(eq(folder.id, id))
}

export async function firstDayOf(tx: Tx, workshopId: string): Promise<string | null> {
  const rows = await tx
    .select({ id: workshopDay.id })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, workshopId))
    .orderBy(asc(workshopDay.position))
    .limit(1)
  return rows[0]?.id ?? null
}

export async function listDays(tx: Tx, workshopId: string) {
  return tx
    .select({
      id: workshopDay.id,
      title: workshopDay.title,
      date: workshopDay.date,
      position: workshopDay.position,
    })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, workshopId))
    .orderBy(asc(workshopDay.position))
}

export async function createFolder(
  tx: Tx,
  actor: Actor,
  name: string,
  parentId: string | null,
): Promise<string> {
  let ancestors: string[] = []
  if (parentId) {
    const parents = await tx
      .select({ ancestors: folder.ancestorIds })
      .from(folder)
      .where(eq(folder.id, parentId))
      .limit(1)
    if (!parents[0]) throw new NotFoundError()
    ancestors = [...parents[0].ancestors, parentId]
  }

  const siblings = await tx
    .select({ id: folder.id, position: folder.position })
    .from(folder)
    .where(parentId === null ? isNull(folder.parentId) : eq(folder.parentId, parentId))

  const id = uuidv7()
  await tx.insert(folder).values({
    id,
    name,
    parentId,
    ancestorIds: ancestors,
    position: keyAtEnd(siblings),
    createdBy: actor.memberId,
  })
  return id
}
