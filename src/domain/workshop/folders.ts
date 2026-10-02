import { uuidv7 } from 'uuidv7'
import { and, eq, isNull, ne, sql, type SQL } from 'drizzle-orm'
import { type Actor, type Tx } from '@/server/db'
import { folder, workshop } from '@/server/db/schema'
import { sortFolderTree } from '@/domain/workshop/folder-order'
import { folderReachSql } from '@/domain/workshop/folder-access'
import { keyAtEnd, placeAfter } from '@/domain/agenda/ordering'
import { DomainError } from '@/domain/errors'
import { NotFoundError } from '@/domain/agenda/access'

/**
 * The folder tree of a library.
 *
 * A tree in one table, ordered by fractional keys among siblings, and every
 * question about "is this folder inside that one" answered by SQL rather than by
 * walking rows in the application -- see ./folder-access.ts. Moving a folder is
 * the hard case and has a file's worth of reasoning over it below.
 *
 * The workshops that sit in these folders are in ./repo.ts, reading the library
 * as a list is in ./library.ts.
 */

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

/**
 * The folders this actor holds a role on, as a predicate over `folder`.
 *
 * Holding a role is the whole test: having made the folder or one above it, or
 * a grant on it or on one above it -- the same `folderReachSql` the library
 * asks of a workshop's folder, so a folder and the workshops filed in it come
 * and go together. An admin holds a role on every folder. A guest on a share
 * link holds none: they reached one workshop, not a library.
 *
 * Undefined means "no filter", which is how drizzle's `and` reads it.
 */
export function folderVisibleTo(actor: Actor): SQL | undefined {
  if (actor.share) return sql`false`
  if (actor.tenantRole === 'admin') return undefined
  return folderReachSql(folder.id, actor.memberId)
}

/**
 * The folder tree as this actor may see it.
 *
 * A folder nobody gave you is not there -- not greyed out, not as a name on the
 * way to the one you were given, because the name is already what it says
 * about the work. A grant reaches downwards, so what is left is a set of whole
 * subtrees; the top of each stands at the top level for this reader, with the
 * path above it cut off, or the move menu would still carry ids of folders they
 * cannot open.
 */
export async function listFolders(tx: Tx, actor: Actor): Promise<FolderNode[]> {
  const rows = await tx
    .select({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      ancestorIds: folder.ancestorIds,
    })
    .from(folder)
    .where(folderVisibleTo(actor))

  const visible = new Set(rows.map((row) => row.id))
  const rooted = rows.map((row) => ({
    ...row,
    parentId: row.parentId !== null && visible.has(row.parentId) ? row.parentId : null,
    ancestorIds: row.ancestorIds.filter((id) => visible.has(id)),
  }))

  // Sorted into tree order in memory: folder trees are hundreds of rows, and a
  // recursive CTE here would buy nothing but a harder query to read. The
  // siblings come out alphabetical -- see folder-order.ts for why.
  return sortFolderTree(rooted)
}

/**
 * Whether this actor may file something in `folderId`, answered as "is it
 * there".
 *
 * One answer for "gone", "another tenant's" and "not yours", on purpose: the
 * folder is not in their tree, and an error that told the three apart would
 * tell them that a folder of that id exists.
 */
export async function folderReachable(tx: Tx, actor: Actor, folderId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: folder.id })
    .from(folder)
    .where(and(eq(folder.id, folderId), folderVisibleTo(actor)))
    .limit(1)
  return rows.length > 0
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
 * `afterId` still places `position` behind that sibling, null for first, but
 * `listFolders` no longer reads it: siblings are listed alphabetically. The
 * parameter stays for MCP clients that send it.
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
/**
 * Renames a folder.
 *
 * The name clash is answered here rather than by folder_sibling_name_uq, for
 * the same reason as in createFolder: the database's answer is a unique
 * violation, and the sidebar would show it to somebody who typed a name that
 * was simply already taken.
 *
 * A folder may keep its own name spelled differently -- otherwise correcting
 * the capitalisation of a folder would be refused by the folder itself.
 */
export async function renameFolder(tx: Tx, id: string, name: string): Promise<void> {
  const rows = await tx
    .select({ parentId: folder.parentId })
    .from(folder)
    .where(eq(folder.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) throw new NotFoundError()

  const clash = await tx
    .select({ id: folder.id })
    .from(folder)
    .where(
      and(
        sameParent(found.parentId),
        sql`lower(${folder.name}) = lower(${name})`,
        sql`${folder.id} <> ${id}::uuid`,
      ),
    )
    .limit(1)
  if (clash[0]) throw new FolderMoveError('folder.nameTaken')

  await tx.update(folder).set({ name }).where(eq(folder.id, id))
}

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

export async function createFolder(
  tx: Tx,
  actor: Actor,
  name: string,
  parentId: string | null,
): Promise<string> {
  let ancestors: string[] = []
  if (parentId) {
    // Only into a folder of theirs: whoever makes a folder owns it, and owning
    // a corner of a tree you cannot see is a way into what sits around it.
    const parents = await tx
      .select({ ancestors: folder.ancestorIds })
      .from(folder)
      .where(and(eq(folder.id, parentId), folderVisibleTo(actor)))
      .limit(1)
    if (!parents[0]) throw new NotFoundError()
    ancestors = [...parents[0].ancestors, parentId]
  }

  // The same question moveFolder asks, for the same reason: folder_sibling_name_uq
  // would otherwise answer with a unique violation nobody can read.
  const clash = await tx
    .select({ id: folder.id })
    .from(folder)
    .where(and(sameParent(parentId), sql`lower(${folder.name}) = lower(${name})`))
    .limit(1)
  if (clash[0]) throw new FolderMoveError('folder.nameTaken')

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
