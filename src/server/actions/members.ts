'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  inviteMember,
  listMembers,
  setMemberRole,
  setMemberStatus,
  type MemberRow,
} from '@/domain/tenant/members'
import { inviteDisclosure } from '@/domain/tenant/invite'
import { issueMagicLink } from '@/server/auth/magic-link'
import { deliversToRecipient, mailConfigFor, sendMail, magicLinkMail } from '@/server/auth/mail'
import { currentActor, fail, toResult, type ActionResult } from './context'

/**
 * Tenant administration.
 *
 * Deliberately not routed through `action()`: that helper opens one
 * tenant-scoped transaction, and everything here has to cross the auth-role
 * boundary for e-mail addresses. The checks it would have performed are
 * performed instead by `assertTenantAdmin` inside every domain function.
 */

export async function loadMembers(): Promise<ActionResult<MemberRow[]>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')
  // The same rule as managing members, so the same sentence: listing them is
  // not a separate permission.
  if (actor.tenantRole !== 'admin') return fail('forbidden', 'domain.member.adminOnly')

  try {
    return { ok: true, data: await listMembers(actor) }
  } catch (error) {
    return toResult(error)
  }
}

export type InviteOutcome = {
  email: string
  alreadyMember: boolean
  /** Set only when the link could not be mailed -- see below. */
  link: string | null
  mailed: boolean
}

/**
 * Invites somebody and gets them a way in.
 *
 * The link is handed back to the admin ONLY when it did not reach the
 * recipient AND the address is not already an active member's. An install with
 * no SMTP is a documented, supported setup, and leaving those admins with an
 * invitation nobody can act on would make the whole screen a decoration.
 *
 * The second half is the one that was missing: for somebody who already has an
 * account, the link is not an invitation but their login, and handing it over
 * is a handover of the account. See `inviteDisclosure` for the table.
 */
export async function inviteMemberAction(raw: {
  email: string
  role: 'member' | 'admin'
}): Promise<ActionResult<InviteOutcome>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = z
    .object({ email: z.string().trim().min(3).max(320), role: z.enum(['member', 'admin']) })
    .safeParse(raw)
  if (!parsed.success) return fail('invalid_input', 'member.checkEmailAndRole')

  try {
    const invited = await inviteMember(actor, parsed.data.email, parsed.data.role)
    const issued = await issueMagicLink(invited.email, actor.tenantId)

    let mailed = false
    // Asked once, for this tenant: whether mail reaches a person decides what
    // the screen may claim, and the answer now depends on configuration that
    // lives in the database rather than only on the environment.
    const deliverable = deliversToRecipient(await mailConfigFor(actor.tenantId))
    if (issued && deliverable) {
      try {
        await sendMail(magicLinkMail(issued.email, issued.link), actor.tenantId)
        mailed = true
      } catch {
        // Reported as "not sent" rather than as a failed invitation: the
        // membership exists either way, and the link below still works.
        mailed = false
      }
    }

    revalidatePath('/admin/members')
    return {
      ok: true,
      data: {
        email: invited.email,
        alreadyMember: invited.alreadyMember,
        mailed,
        link: inviteDisclosure({ alreadyMember: invited.alreadyMember, mailed })
          ? (issued?.link ?? null)
          : null,
      },
    }
  } catch (error) {
    return toResult(error)
  }
}

export async function setMemberRoleAction(raw: {
  memberId: string
  role: 'member' | 'admin'
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  try {
    await setMemberRole(actor, raw.memberId, raw.role)
    revalidatePath('/admin/members')
    return { ok: true, data: null }
  } catch (error) {
    return toResult(error)
  }
}

export async function setMemberStatusAction(raw: {
  memberId: string
  status: 'active' | 'disabled'
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  try {
    await setMemberStatus(actor, raw.memberId, raw.status)
    revalidatePath('/admin/members')
    return { ok: true, data: null }
  } catch (error) {
    return toResult(error)
  }
}
