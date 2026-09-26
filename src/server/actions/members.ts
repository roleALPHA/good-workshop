'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { listMembers, type MemberRow } from '@/domain/tenant/members'
import {
  inviteMember,
  removeMember,
  type RemoveMemberResult,
  setMemberName,
  setMemberRole,
  setMemberStatus,
} from '@/domain/tenant/membership'
import { inviteDisclosure } from '@/domain/tenant/invite'
import { issueMagicLink } from '@/server/auth/magic-link'
import { deliversToRecipient, mailConfigFor, sendMail, magicLinkMail } from '@/server/auth/mail'
import { currentActor, fail, toResult, type ActionResult } from './context'
import { getLocale } from 'next-intl/server'

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
  firstName: string
  lastName: string
}): Promise<ActionResult<InviteOutcome>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = z
    .object({
      email: z.string().trim().min(3).max(320),
      role: z.enum(['member', 'admin']),
      // Checked in the domain, where the rule and its message keys live; here
      // only that something string-shaped arrived.
      firstName: z.string().max(1000),
      lastName: z.string().max(1000),
    })
    .safeParse(raw)
  if (!parsed.success) return fail('invalid_input', 'member.checkEmailAndRole')

  try {
    // The inviting admin's language: a brand-new identity has no preference of
    // its own yet, and starting them in a language somebody nearby actually
    // speaks beats starting everybody in German.
    const locale = await getLocale()
    const invited = await inviteMember(actor, parsed.data.email, parsed.data.role, locale, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    })
    const issued = await issueMagicLink(invited.email, actor.tenantId)

    let mailed = false
    // Asked once, for this tenant: whether mail reaches a person decides what
    // the screen may claim, and the answer now depends on configuration that
    // lives in the database rather than only on the environment.
    const deliverable = deliversToRecipient(await mailConfigFor(actor.tenantId))
    if (issued && deliverable) {
      try {
        await sendMail(magicLinkMail(issued.email, issued.link, issued.locale), actor.tenantId)
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

export async function setMemberNameAction(raw: {
  memberId: string
  firstName: string
  lastName: string
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const input = z
    .object({
      memberId: z.string().uuid(),
      firstName: z.string().max(1000),
      lastName: z.string().max(1000),
    })
    .safeParse(raw)
  if (!input.success) return fail('invalid_input', 'member.gone')

  try {
    await setMemberName(actor, input.data.memberId, {
      firstName: input.data.firstName,
      lastName: input.data.lastName,
    })
    // A name shows up in the header, in the sharing lists and in presence,
    // so everything under the layout is stale, not only this page.
    revalidatePath('/', 'layout')
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

/**
 * Removing somebody for good, with their work handed to a colleague.
 *
 * `successorId` is nullable rather than absent: a member who owns nothing needs
 * no successor, and requiring one would mean inventing a choice for the common
 * case. The domain refuses a missing successor exactly when it matters, which
 * is a decision that belongs next to the count it is based on rather than in a
 * schema here.
 */
export async function removeMemberAction(raw: {
  memberId: string
  successorId: string | null
}): Promise<ActionResult<RemoveMemberResult>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const input = z
    .object({ memberId: z.string().uuid(), successorId: z.string().uuid().nullable() })
    .safeParse(raw)
  if (!input.success) return fail('invalid_input', 'member.gone')

  try {
    const result = await removeMember(actor, input.data.memberId, input.data.successorId)
    revalidatePath('/admin/members')
    // The library lists workshops by owner, so a handover changes what a
    // colleague sees there without them having touched anything.
    revalidatePath('/library')
    return { ok: true, data: result }
  } catch (error) {
    return toResult(error)
  }
}
