import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { memberIdOf, type Actor, type Tx } from '@/server/db'
import { tag, workshop, workshopCollaborator, workshopDay } from '@/server/db/schema'
import {
  folderPathSql,
  folderReachSql,
  folderRoleFromPath,
  inheritedWorkshopRole,
  type FolderPathRow,
} from '@/domain/workshop/folder-access'

/**
 * Reading the library: a page of workshops, the tags they carry, and the bin.
 *
 * Everything here is a read, and every one of them has to answer the same
 * question first -- which workshops may this person see at all, given that access
 * can come from the workshop, from a folder above it, or from being an admin.
 * That is why the helpers at the bottom are shared rather than inlined: three
 * reads disagreeing about visibility is three different libraries.
 *
 * Writing a workshop is in ./repo.ts, the folder tree in ./folders.ts.
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

/**
 * One page of the library, unless a caller asks for another size.
 *
 * The screen loads the next page as the end of the list scrolls into view, so a
 * page only has to fill a screen or two -- and every row costs a folder path
 * and a tag aggregate here. Exported so MCP pages the same way.
 */
export const LIBRARY_PAGE_SIZE = 20

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
  const limit = Math.min(Math.max(options.limit ?? LIBRARY_PAGE_SIZE, 1), 100)
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
      /** Root first. Same aggregate the single-workshop check uses. */
      folderPath: folderPathSql(workshop.folderId, memberIdOf(actor)).mapWith(
        (v) => v as FolderPathRow[],
      ),
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
        eq(workshopCollaborator.memberId, memberIdOf(actor)),
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
      role: roleOf(row.ownerId, row.collaboratorRole, row.folderPath, actor),
    })),
    nextCursor: rows.length > limit && last ? makeCursor(last.updatedAt, last.id) : null,
  }
}

/**
 * Who may see a workshop, as a predicate.
 *
 * The same rules `assertWorkshopAccess` applies to one workshop, said once for
 * a whole list. They have to agree: a row that shows up here and then 404s when
 * opened is a worse bug than either half alone. Which is why the folder leg is
 * the same `folderReachSql` the single check builds its path from, rather than
 * a second spelling of "somewhere up the tree".
 */
function visibleTo(actor: Actor) {
  if (actor.tenantRole === 'admin') return undefined
  const memberId = memberIdOf(actor)
  return or(
    eq(workshop.ownerId, memberId),
    sql`exists (select 1 from workshop_collaborator wc
                where wc.workshop_id = ${workshop.id} and wc.member_id = ${memberId})`,
    folderReachSql(workshop.folderId, memberId),
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
  folderPath: readonly FolderPathRow[],
  actor: Actor,
): WorkshopSummary['role'] {
  if (ownerId === actor.memberId) return 'owner'
  if (collaboratorRole === 'editor' || collaboratorRole === 'viewer') return collaboratorRole
  // Same order as `effectiveRole`: what the folder confers sits in front of the
  // admin fallback, so an admin who was granted viewer on a folder is shown as
  // a viewer rather than as an admin.
  const inherited = inheritedWorkshopRole(folderRoleFromPath(folderPath, actor))
  if (inherited) return inherited
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
              eq(workshop.ownerId, memberIdOf(actor)),
              sql`exists (select 1 from ${workshopCollaborator} wc
                           where wc.workshop_id = ${workshop.id}
                             and wc.member_id = ${memberIdOf(actor)})`,
            ),
      ),
    )
    .orderBy(desc(workshop.deletedAt))
}
