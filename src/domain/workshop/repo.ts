import { uuidv7 } from 'uuidv7'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import { folder, member, workshop, workshopCollaborator, workshopDay } from '@/server/db/schema'
import { keyAtEnd } from '@/domain/agenda/ordering'
import type { WorkshopAccess } from '@/domain/agenda/access'

/**
 * The workshop library: folders, and the workshops inside them.
 *
 * Listing is the one place a per-workshop ACL cannot be a post-filter -- fetch
 * everything and drop what you may not see and the page sizes are wrong. It is
 * expressed as a join instead, so the database returns exactly what this member
 * is allowed to open.
 */

export type WorkshopSummary = {
  id: string
  title: string
  status: string
  folderId: string | null
  updatedAt: Date
  dayCount: number
  role: 'owner' | 'editor' | 'viewer' | 'admin'
}

export type FolderNode = {
  id: string
  name: string
  parentId: string | null
  depth: number
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
      out.push({ id: row.id, name: row.name, parentId: row.parentId, depth })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export async function listWorkshops(
  tx: Tx,
  actor: Actor,
  options: { folderId?: string | null } = {},
): Promise<WorkshopSummary[]> {
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
        options.folderId === undefined
          ? undefined
          : options.folderId === null
            ? isNull(workshop.folderId)
            : eq(workshop.folderId, options.folderId),
      ),
    )
    .orderBy(desc(workshop.updatedAt))

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      folderId: row.folderId,
      updatedAt: row.updatedAt,
      dayCount: row.dayCount,
      role: roleOf(row.ownerId, row.collaboratorRole, actor),
    }))
    .filter((row): row is WorkshopSummary => row.role !== null)
}

function roleOf(
  ownerId: string,
  collaboratorRole: string | null,
  actor: Actor,
): WorkshopSummary['role'] | null {
  if (ownerId === actor.memberId) return 'owner'
  if (collaboratorRole === 'editor' || collaboratorRole === 'viewer') return collaboratorRole
  if (actor.tenantRole === 'admin') return 'admin'
  return null
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
  if (!memberships[0]) throw new Error('Mitgliedschaft nicht gefunden.')

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
    if (!parents[0]) throw new Error('Übergeordneter Ordner nicht gefunden.')
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
