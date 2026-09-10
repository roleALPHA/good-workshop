'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  SharingError,
  listCollaborators,
  removeCollaborator,
  setCollaborator,
} from '@/domain/workshop/collaborators'
import { listDirectory, type MemberRow } from '@/domain/tenant/members'
import { workshopAction, currentActor, type ActionResult } from './context'
import { withTenant } from '@/server/db'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { eq } from 'drizzle-orm'
import { workshop } from '@/server/db/schema'

/**
 * Sharing one workshop with people who are already in the tenant.
 *
 * The screen needs both halves at once -- who has access, and who could -- so
 * it is one read rather than two round trips that can disagree with each other.
 */

export type SharingView = {
  title: string
  ownerId: string
  canShare: boolean
  people: (MemberRow & { access: 'owner' | 'editor' | 'viewer' | 'none' })[]
}

export async function loadSharing(workshopId: string): Promise<ActionResult<SharingView>> {
  const actor = await currentActor()
  if (!actor) return { ok: false, error: 'unauthenticated', message: 'Bitte melde dich an.' }

  try {
    const [members, data] = await Promise.all([
      // Everyone in the tenant, so the picker can offer them. Reading the list
      // needs the auth role for e-mail addresses, which is why it does not run
      // inside the transaction below.
      listDirectory(actor),
      withTenant(actor, async (tx) => {
        const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
        const meta = await tx
          .select({ title: workshop.title })
          .from(workshop)
          .where(eq(workshop.id, workshopId))
          .limit(1)
        return {
          ...(await listCollaborators(tx, access)),
          title: meta[0]?.title ?? 'Workshop',
          canShare: access.can('workshop.share'),
        }
      }),
    ])

    const roleByMember = new Map(data.collaborators.map((row) => [row.memberId, row.role]))

    return {
      ok: true,
      data: {
        title: data.title,
        ownerId: data.ownerId,
        canShare: data.canShare,
        people: members.map((person) => ({
          ...person,
          access: person.id === data.ownerId ? 'owner' : (roleByMember.get(person.id) ?? 'none'),
        })),
      },
    }
  } catch (error) {
    return toResult(error)
  }
}

export async function setCollaboratorAction(raw: {
  workshopId: string
  memberId: string
  role: 'editor' | 'viewer'
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({
      workshopId: z.string().uuid(),
      memberId: z.string().uuid(),
      role: z.enum(['editor', 'viewer']),
    }),
    raw,
    'workshop.share',
    async (tx, access, input) => {
      await setCollaborator(tx, access, input.memberId, input.role)
      return null
    },
  )

  if (result.ok) revalidatePath(`/w/${raw.workshopId}/sharing`)
  return result
}

export async function removeCollaboratorAction(raw: {
  workshopId: string
  memberId: string
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid(), memberId: z.string().uuid() }),
    raw,
    'workshop.share',
    async (tx, access, input) => {
      await removeCollaborator(tx, access, input.memberId)
      return null
    },
  )

  if (result.ok) revalidatePath(`/w/${raw.workshopId}/sharing`)
  return result
}

function toResult<T>(error: unknown): ActionResult<T> {
  if (error instanceof SharingError) {
    return { ok: false, error: 'invalid_input', message: error.message }
  }
  console.error('sharing action failed', error)
  return { ok: false, error: 'failed', message: 'Das hat nicht geklappt.' }
}
