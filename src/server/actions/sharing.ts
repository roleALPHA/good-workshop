'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  listCollaborators,
  removeCollaborator,
  setCollaborator,
} from '@/domain/workshop/collaborators'
import { listDirectory, type MemberRow } from '@/domain/tenant/members'
import { workshopAction, currentActor, fail, toResult, type ActionResult } from './context'
import { withTenant } from '@/server/db'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { eq } from 'drizzle-orm'
import { workshop } from '@/server/db/schema'
import { getLocale } from 'next-intl/server'
import {
  createShareLink,
  lastDayOf,
  listShareLinks,
  revokeShareLink,
  type ShareLink,
} from '@/domain/workshop/share-links'
import { newShareToken, shareLinkUrl } from '@/server/auth/share-invite'
import { deliversToRecipient, mailConfigFor, sendMail, shareInviteMail } from '@/server/auth/mail'
import { rateLimiter } from '@/server/auth/ratelimit'

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
  /** Invitations to people who have no account. Empty unless the reader may share. */
  guests: ShareLink[]
  /** Whether the agenda is dated, which decides what the screen says about validity. */
  dated: boolean
}

export async function loadSharing(workshopId: string): Promise<ActionResult<SharingView>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

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
        const canShare = access.can('workshop.share')
        return {
          ...(await listCollaborators(tx, access)),
          title: meta[0]?.title ?? 'Workshop',
          canShare,
          // Only for somebody who may invite. A viewer has no reason to be shown
          // the addresses of a workshop's external guests.
          guests: canShare ? await listShareLinks(tx, access) : [],
          dated: canShare ? (await lastDayOf(tx, workshopId)) !== null : false,
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
        guests: data.guests,
        dated: data.dated,
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

/**
 * Inviting somebody who has no account, on top of the member list above.
 *
 * The mail goes out through the operator's own relay, and the address comes from
 * a form. That is a relay a member could otherwise point at a stranger's inbox
 * twenty times a minute, so the send is throttled -- per member, because the
 * person doing it is signed in and therefore nameable.
 */
const invitations = rateLimiter({ limit: 20, windowMs: 60_000 })

export type GuestInviteOutcome = {
  email: string
  mailed: boolean
  /**
   * The link, ONLY when the mail did not reach the recipient.
   *
   * Same reasoning as inviteDisclosure for members -- an install with no relay
   * needs the invitation screen to do something -- but without its second
   * condition. That one exists because an active member's magic link IS their
   * login, and handing it over is a handover of the account. A share link is
   * nobody's login: it grants guest access to one workshop, which the person
   * showing the screen already reads in full. There is nothing here to escalate.
   */
  link: string | null
}

export async function inviteGuestAction(raw: {
  workshopId: string
  email: string
  role: 'editor' | 'viewer'
}): Promise<ActionResult<GuestInviteOutcome>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')
  if (!invitations.take(actor.memberId ?? 'unknown')) {
    return fail('failed', 'domain.sharing.tooManyInvites')
  }

  // Minted outside the transaction, and returned from it: only the hash is
  // stored, so this value exists exactly once and there is no later chance to
  // show the link again.
  const { token, tokenHash } = newShareToken()

  const result = await workshopAction(
    z.object({
      workshopId: z.string().uuid(),
      email: z.string().trim().min(3).max(320),
      role: z.enum(['editor', 'viewer']),
    }),
    raw,
    'workshop.share',
    async (tx, access, input) => {
      const link = await createShareLink(tx, access, input.email, input.role, tokenHash)
      const meta = await tx
        .select({ title: workshop.title })
        .from(workshop)
        .where(eq(workshop.id, input.workshopId))
        .limit(1)
      return { email: link.email, title: meta[0]?.title ?? 'Workshop' }
    },
  )

  if (!result.ok) return result

  // After the transaction, never inside it: a slow or broken relay must not hold
  // a database transaction open, and an invitation that was written must not be
  // rolled back because the mail bounced.
  const url = shareLinkUrl(token)
  let mailed = false
  const deliverable = deliversToRecipient(await mailConfigFor(actor.tenantId))
  if (deliverable) {
    try {
      // The recipient's language, which for somebody with no account is the
      // language of whoever invited them -- there is no preference to read.
      await sendMail(
        shareInviteMail(result.data.email, url, result.data.title, await getLocale()),
        actor.tenantId,
      )
      mailed = true
    } catch {
      // "Not sent" rather than a failed invitation: the link exists and works,
      // and the screen is about to show it.
      mailed = false
    }
  }

  revalidatePath(`/w/${raw.workshopId}/sharing`)
  return {
    ok: true,
    data: { email: result.data.email, mailed, link: mailed ? null : url },
  }
}

export async function revokeGuestAction(raw: {
  workshopId: string
  linkId: string
}): Promise<ActionResult<null>> {
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid(), linkId: z.string().uuid() }),
    raw,
    'workshop.share',
    async (tx, access, input) => {
      await revokeShareLink(tx, access, input.linkId)
      return null
    },
  )

  if (result.ok) revalidatePath(`/w/${raw.workshopId}/sharing`)
  return result
}
