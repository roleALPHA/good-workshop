'use server'

import { eq } from 'drizzle-orm'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { currentActor, fail, firstIssue, type ActionResult } from '@/server/actions/context'
import { rateLimiter } from '@/server/auth/ratelimit'
import { readSession } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { tenant } from '@/server/db/schema'
import { displayVersion } from '@/lib/version'
import { SUPPORT_EMAIL } from '@/cloud/support/address'
import { createTicket, zammadConfig } from '@/cloud/support/zammad'

/**
 * The support form's one write: a ticket in the helpdesk. Only a cloud build
 * has the page that calls it.
 *
 * Nothing is stored here. The ticket, the answer and the follow-up all live in
 * the helpdesk; what this adds is what support would otherwise have to ask
 * first -- which workspace, which role, which version, which language.
 */

/**
 * Per member. Five an hour is more than anybody writes to support, and few
 * enough that a stuck double-click or a script does not flood the helpdesk.
 */
const requests = rateLimiter({ limit: 5, windowMs: 60 * 60_000 })

const supportInput = z.object({
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(5000),
})

export async function sendSupportRequestAction(
  raw: unknown,
): Promise<ActionResult<{ number: string }>> {
  const [actor, session] = await Promise.all([currentActor(), readSession()])
  if (!actor || !session) return fail('unauthenticated', 'unauthenticated')

  const parsed = supportInput.safeParse(raw)
  if (!parsed.success) {
    const issue = firstIssue(parsed.error)
    return fail('invalid_input', issue.key, issue.params)
  }

  const config = zammadConfig()
  if (!config) return fail('failed', 'supportUnavailable', { email: SUPPORT_EMAIL })
  if (!requests.take(actor.memberId ?? session.identityId))
    return fail('forbidden', 'tooManyRequests')

  const [workspace, locale] = await Promise.all([
    withTenant(actor, (tx) =>
      tx.select({ name: tenant.name }).from(tenant).where(eq(tenant.id, actor.tenantId)).limit(1),
    ),
    getLocale(),
  ])

  // In English whatever the person's language: it is read by support, and the
  // message above it is in the language the person wrote it in.
  const from = session.displayName ? `${session.displayName} <${session.email}>` : session.email
  const body = [
    parsed.data.message,
    '',
    '--',
    `From: ${from}`,
    `Workspace: ${workspace[0]?.name ?? actor.tenantId}`,
    `Role: ${actor.tenantRole}`,
    `Version: ${displayVersion()}`,
    `Language: ${locale}`,
  ].join('\n')

  const result = await createTicket(config, {
    subject: parsed.data.subject,
    body,
    customerEmail: session.email,
  })
  if (result.status === 'created') return { ok: true, data: { number: result.number } }

  console.error('support ticket failed', result.error)
  return fail('failed', 'supportUnavailable', { email: SUPPORT_EMAIL })
}
