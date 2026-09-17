'use server'

import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { sql } from 'drizzle-orm'
import { DomainError } from '@/domain/errors'
import { clientAddress } from '@/server/auth/client-address'
import { rateLimiter } from '@/server/auth/ratelimit'
import { createSession } from '@/server/auth/session'
import { withTenantOnly } from '@/server/db'
import type { Translate } from '@/i18n/translator'
import { parseSignup } from '@/cloud/registration/rules'
import { completeSignup, requestSignup, sendWelcome } from '@/cloud/registration/signup'
import { checkVatId } from '@/cloud/tax/vies'
import { SignupError } from '@/cloud/registration/rules'

/**
 * Registration, from an anonymous form. Only reachable in a cloud build: the
 * pages that call these are `page.cloud.tsx`.
 */

const attempts = rateLimiter({ limit: 10, windowMs: 60 * 60_000 })

export type RegisterResult = { ok: true; email: string } | { ok: false; error: string }

export async function register(raw: Record<string, unknown>): Promise<RegisterResult> {
  const caller = clientAddress(await headers())
  const t = (await getTranslations('errors')) as unknown as Translate

  // A field no person sees. Something that fills it in gets the same answer as
  // everybody else, and nothing happens.
  if (typeof raw.website === 'string' && raw.website !== '') {
    return { ok: true, email: String(raw.email ?? '') }
  }
  if (!attempts.take(caller)) return { ok: false, error: t('tooManyRequests') }

  try {
    const signup = parseSignup(raw)
    // Asked before the link goes out, so a mistyped number is corrected now and
    // not discovered on the first invoice. VIES being unreachable does not stop
    // a registration: the check stays pending and is asked again later.
    const vatCheck = signup.vatId ? await checkVatId(signup.vatId) : undefined
    if (vatCheck?.status === 'invalid') throw new SignupError('signup.vatIdInvalid')
    await requestSignup(signup, (await getLocale()) as never, { ip: caller, vatCheck })
    return { ok: true, email: signup.email }
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error: t(`domain.${error.messageKey}`, error.params) }
    }
    console.error('signup failed', { error })
    return { ok: false, error: t('failed') }
  }
}

export type ConfirmResult = { ok: true } | { ok: false; reason: 'invalid' | 'exists' }

export async function confirmSignup(token: string): Promise<ConfirmResult> {
  const completed = await completeSignup(token)
  if (completed.outcome !== 'created') return { ok: false, reason: completed.outcome }

  await createSession(completed.identityId, completed.tenantId, 'magic_link', {
    userAgent: (await headers()).get('user-agent') ?? undefined,
  })

  // The welcome mail carries the terms as they were agreed. Failing to send it
  // must not undo a workspace that exists: it is logged, and the terms are
  // still on the website.
  try {
    const rows = await withTenantOnly(completed.tenantId, (tx) =>
      tx.execute(sql`select billing_email from billing_account`),
    )
    const account = (rows as unknown as { rows: { billing_email: string }[] }).rows[0]
    if (account) {
      await sendWelcome(account.billing_email, (await getLocale()) as never)
    }
  } catch (error) {
    console.error('welcome mail failed', { error, tenantId: completed.tenantId })
  }

  return { ok: true }
}
