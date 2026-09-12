'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/server/db'
import { folder } from '@/server/db/schema'
import { listDirectory, type MemberRow } from '@/domain/tenant/members'
import { grantableRoles, type GrantableFolderRole } from '@/domain/workshop/folder-access'
import {
  assertFolderAccess,
  listFolderCollaborators,
  removeFolderCollaborator,
  setFolderCollaborator,
} from '@/domain/workshop/folder-collaborators'
import { currentActor, fail, toResult, type ActionResult } from './context'

/**
 * Sharing a folder, and with it everything beneath it.
 *
 * Like the workshop screen, both halves in one read: who has access, and who
 * could. Unlike it, the screen also has to know what the READER may hand on --
 * a viewer sees the list and may add viewers, and offering them an "editor"
 * option that the domain then refuses would be a screen that lies.
 */

export type FolderSharingView = {
  name: string
  createdBy: string | null
  /** Empty for somebody who may look but not grant. */
  grantable: readonly GrantableFolderRole[]
  people: (MemberRow & { access: 'creator' | GrantableFolderRole | 'none' })[]
}

export async function loadFolderSharing(
  folderId: string,
): Promise<ActionResult<FolderSharingView>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  try {
    const [members, data] = await Promise.all([
      listDirectory(actor),
      withTenant(actor, async (tx) => {
        const access = await assertFolderAccess(tx, actor, folderId)
        const meta = await tx
          .select({ name: folder.name, createdBy: folder.createdBy })
          .from(folder)
          .where(eq(folder.id, folderId))
          .limit(1)

        return {
          name: meta[0]?.name ?? '',
          createdBy: meta[0]?.createdBy ?? null,
          grantable: grantableRoles(access.role),
          collaborators: await listFolderCollaborators(tx, access),
        }
      }),
    ])

    const roleByMember = new Map(data.collaborators.map((row) => [row.memberId, row.role]))

    return {
      ok: true,
      data: {
        name: data.name,
        createdBy: data.createdBy,
        grantable: data.grantable,
        people: members.map((person) => ({
          ...person,
          access:
            person.id === data.createdBy ? 'creator' : (roleByMember.get(person.id) ?? 'none'),
        })),
      },
    }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * There is no `folderAction` helper the way there is `workshopAction`.
 *
 * That helper takes a `Capability` and resolves a `WorkshopAccess`; a folder
 * has neither -- what it has is a role, and the question is never "may you do
 * this" but "may you hand THIS on", which only the domain can answer once it
 * knows the target role. So the two actions below resolve access themselves and
 * let `setFolderCollaborator` refuse.
 */
export async function setFolderCollaboratorAction(raw: {
  folderId: string
  memberId: string
  role: GrantableFolderRole
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = z
    .object({
      folderId: z.string().uuid(),
      memberId: z.string().uuid(),
      role: z.enum(['editor', 'viewer']),
    })
    .safeParse(raw)
  if (!parsed.success) return fail('invalid_input', 'invalid_input')

  try {
    await withTenant(actor, async (tx) => {
      const access = await assertFolderAccess(tx, actor, parsed.data.folderId)
      await setFolderCollaborator(tx, access, parsed.data.memberId, parsed.data.role)
    })
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/library')
  revalidatePath(`/f/${parsed.data.folderId}/sharing`)
  return { ok: true, data: null }
}

export async function removeFolderCollaboratorAction(raw: {
  folderId: string
  memberId: string
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = z
    .object({ folderId: z.string().uuid(), memberId: z.string().uuid() })
    .safeParse(raw)
  if (!parsed.success) return fail('invalid_input', 'invalid_input')

  try {
    await withTenant(actor, async (tx) => {
      const access = await assertFolderAccess(tx, actor, parsed.data.folderId)
      await removeFolderCollaborator(tx, access, parsed.data.memberId)
    })
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/library')
  revalidatePath(`/f/${parsed.data.folderId}/sharing`)
  return { ok: true, data: null }
}
