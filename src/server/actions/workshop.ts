'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createFolder,
  createWorkshop,
  listDays,
  listFolders,
  listWorkshops,
  renameWorkshop,
  trashWorkshop,
} from '@/domain/workshop/repo'
import { action, workshopAction, type ActionResult } from './context'

/**
 * Library actions.
 *
 * Every one of them goes through `action` / `workshopAction`, which is what
 * guarantees a tenant context and -- for anything touching a single workshop --
 * a resolved capability before a single row is read.
 */

const Title = z.string().trim().min(1, 'Ein Titel ist nötig.').max(300)

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

export async function createFolderAction(raw: {
  name: string
  parentId?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const result = await action(
    z.object({
      name: z.string().trim().min(1, 'Ein Name ist nötig.').max(120),
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
export async function loadLibrary(folderId?: string | null) {
  return action(
    z.object({ folderId: z.string().uuid().nullable().optional() }),
    { folderId },
    async (tx, actor, input) => ({
      folders: await listFolders(tx),
      workshops: await listWorkshops(tx, actor, { folderId: input.folderId }),
    }),
  )
}

export async function loadDays(workshopId: string) {
  return workshopAction(
    z.object({ workshopId: z.string().uuid() }),
    { workshopId },
    'workshop.read',
    (tx, _access, input) => listDays(tx, input.workshopId),
  )
}
