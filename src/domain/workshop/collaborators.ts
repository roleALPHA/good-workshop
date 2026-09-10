import { and, eq } from 'drizzle-orm'
import type { WorkshopAccess } from '@/domain/agenda/access'
import type { Tx } from '@/server/db'
import { member, workshop, workshopCollaborator } from '@/server/db/schema'

/**
 * Who may open one workshop.
 *
 * Collaborators are named by MEMBER, never by e-mail: an address is an identity
 * and identities are global, so inviting by address here would silently create
 * cross-tenant access. Somebody has to be in the tenant before they can be on a
 * workshop, which is also the order the two screens are laid out in.
 */

export type CollaboratorRole = 'editor' | 'viewer'

export type Collaborator = {
  memberId: string
  role: CollaboratorRole
}

export class SharingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SharingError'
  }
}

export async function listCollaborators(
  tx: Tx,
  access: WorkshopAccess,
): Promise<{ ownerId: string; collaborators: Collaborator[] }> {
  const owner = await tx
    .select({ ownerId: workshop.ownerId })
    .from(workshop)
    .where(eq(workshop.id, access.workshopId))
    .limit(1)

  const rows = await tx
    .select({ memberId: workshopCollaborator.memberId, role: workshopCollaborator.role })
    .from(workshopCollaborator)
    .where(eq(workshopCollaborator.workshopId, access.workshopId))

  return {
    ownerId: owner[0]?.ownerId ?? '',
    collaborators: rows.map((row) => ({
      memberId: row.memberId,
      role: row.role === 'viewer' ? 'viewer' : 'editor',
    })),
  }
}

export async function setCollaborator(
  tx: Tx,
  access: WorkshopAccess,
  memberId: string,
  role: CollaboratorRole,
): Promise<void> {
  const exists = await tx
    .select({ id: member.id, status: member.status })
    .from(member)
    .where(eq(member.id, memberId))
    .limit(1)

  // RLS already makes a member of another tenant invisible, so this reads as
  // "no such member" rather than leaking that they exist elsewhere.
  if (!exists[0]) throw new SharingError('Dieses Mitglied gibt es nicht.')
  if (exists[0].status === 'disabled') {
    throw new SharingError('Dieses Mitglied ist abgeschaltet.')
  }

  const owner = await tx
    .select({ ownerId: workshop.ownerId })
    .from(workshop)
    .where(eq(workshop.id, access.workshopId))
    .limit(1)

  // The owner already has more than any collaborator role could grant, and a
  // row saying otherwise would read as a demotion that never took effect.
  if (owner[0]?.ownerId === memberId) {
    throw new SharingError('Der Eigentümer hat bereits vollen Zugriff.')
  }

  await tx
    .insert(workshopCollaborator)
    .values({
      workshopId: access.workshopId,
      memberId,
      role,
      addedBy: access.actor.memberId,
    })
    .onConflictDoUpdate({
      target: [workshopCollaborator.workshopId, workshopCollaborator.memberId],
      set: { role },
    })
}

export async function removeCollaborator(
  tx: Tx,
  access: WorkshopAccess,
  memberId: string,
): Promise<void> {
  await tx
    .delete(workshopCollaborator)
    .where(
      and(
        eq(workshopCollaborator.workshopId, access.workshopId),
        eq(workshopCollaborator.memberId, memberId),
      ),
    )
}
