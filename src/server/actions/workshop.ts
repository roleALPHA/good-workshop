'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createFolder,
  createWorkshop,
  listDays,
  listFolders,
  listTags,
  listWorkshops,
  renameWorkshop,
  trashWorkshop,
  restoreWorkshop,
  purgeWorkshop,
  listTrashedWorkshops,
  deleteFolder,
} from '@/domain/workshop/repo'
import { pruneUnusedTags, setWorkshopTags } from '@/domain/workshop/tags'
import { assertTenantAdmin } from '@/domain/tenant/members'
import { NotFoundError } from '@/domain/agenda/access'
import { action, workshopAction, type ActionResult } from './context'

/**
 * Library actions.
 *
 * Every one of them goes through `action` / `workshopAction`, which is what
 * guarantees a tenant context and -- for anything touching a single workshop --
 * a resolved capability before a single row is read.
 */

// No custom message: only the field path leaves this layer now, because
// zod's own text is English and an override here would be one language out of
// four. See firstIssue in ./context.
const Title = z.string().trim().min(1).max(300)

export async function createWorkshopAction(raw: {
  title: string
  folderId?: string | null
  date?: string | null
}): Promise<ActionResult<{ workshopId: string; dayId: string }>> {
  const result = await action(
    z.object({
      title: Title,
      folderId: z.string().uuid().nullable().optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT.')
        .nullable()
        .optional(),
    }),
    raw,
    (tx, actor, input) => createWorkshop(tx, actor, input),
  )

  if (result.ok) revalidatePath('/library')
  return result
}

export async function renameWorkshopAction(raw: {
  workshopId: string
  title: string
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid(), title: Title }),
    raw,
    'workshop.update',
    async (tx, access, input) => {
      await renameWorkshop(tx, access, input.title)
      return null
    },
  )

  if (result.ok) {
    revalidatePath('/library')
    revalidatePath(`/w/${raw.workshopId}`)
  }
  return result
}

export async function trashWorkshopAction(raw: {
  workshopId: string
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid() }),
    raw,
    'workshop.delete',
    async (tx, access) => {
      await trashWorkshop(tx, access)
      return null
    },
  )

  if (result.ok) revalidatePath('/library')
  return result
}

export async function restoreWorkshopAction(raw: {
  workshopId: string
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid() }),
    raw,
    'workshop.delete',
    async (tx, access) => {
      await restoreWorkshop(tx, access)
      return null
    },
    { includeTrashed: true },
  )

  if (result.ok) revalidatePath('/library')
  return result
}

/**
 * Irreversible, and only from the bin.
 *
 * purgeWorkshop refuses a row whose deleted_at is null, so "delete" and "delete
 * for good" stay two decisions taken at two moments -- there is no single click
 * anywhere that ends weeks of preparation.
 */
export async function purgeWorkshopAction(raw: {
  workshopId: string
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid() }),
    raw,
    'workshop.delete',
    async (tx, access) => {
      const removed = await purgeWorkshop(tx, access)
      if (removed === 0) {
        throw new NotFoundError()
      }
      return null
    },
    { includeTrashed: true },
  )

  if (result.ok) revalidatePath('/library')
  return result
}

export async function loadTrash(): Promise<
  ActionResult<{ id: string; title: string; deletedAt: string | null }[]>
> {
  return action(z.object({}), {}, async (tx, actor) => {
    const rows = await listTrashedWorkshops(tx, actor)
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    }))
  })
}

/**
 * Deletes a folder; everything inside moves up one level.
 *
 * Guarded by the tenant admin check rather than by workshop capabilities: a
 * folder belongs to the tenant, not to a workshop, and the workshops inside it
 * may well belong to other people. None of them is touched beyond where it sits.
 */
export async function deleteFolderAction(raw: { id: string }): Promise<ActionResult<null>> {
  const result = await action(z.object({ id: z.string().uuid() }), raw, async (tx, actor) => {
    assertTenantAdmin(actor)
    await deleteFolder(tx, raw.id)
    return null
  })

  if (result.ok) revalidatePath('/library')
  return result
}

export async function createFolderAction(raw: {
  name: string
  parentId?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const result = await action(
    z.object({
      name: z.string().trim().min(1).max(120),
      parentId: z.string().uuid().nullable().optional(),
    }),
    raw,
    async (tx, actor, input) => ({
      id: await createFolder(tx, actor, input.name, input.parentId ?? null),
    }),
  )

  if (result.ok) revalidatePath('/library')
  return result
}

/** Read helpers used by server components; same guarantees, no revalidation. */
export async function loadLibrary(
  query: {
    folderId?: string | null
    tagId?: string
    search?: string
    cursor?: string
  } = {},
) {
  return action(
    z.object({
      folderId: z.string().uuid().nullable().optional(),
      tagId: z.string().uuid().optional(),
      search: z.string().trim().max(200).optional(),
      cursor: z.string().max(200).optional(),
    }),
    query,
    async (tx, actor, input) => {
      const page = await listWorkshops(tx, actor, input)
      return {
        folders: await listFolders(tx),
        tags: await listTags(tx),
        workshops: page.workshops,
        nextCursor: page.nextCursor,
      }
    },
  )
}

export async function setTagsAction(raw: {
  workshopId: string
  tags: string[]
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid(), tags: z.array(z.string()).max(24) }),
    raw,
    'workshop.update',
    async (tx, access, input) => {
      await setWorkshopTags(tx, access, input.tags)
      // Tags nobody uses any more would otherwise pile up in the filter row.
      await pruneUnusedTags(tx)
      return null
    },
  )

  if (result.ok) {
    revalidatePath('/library')
    revalidatePath(`/w/${raw.workshopId}`)
  }
  return result
}

export async function loadDays(workshopId: string) {
  return workshopAction(
    z.object({ workshopId: z.string().uuid() }),
    { workshopId },
    'workshop.read',
    (tx, _access, input) => listDays(tx, input.workshopId),
  )
}
