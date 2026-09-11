'use server'

import { headers } from 'next/headers'
import { clientAddress } from '@/server/auth/client-address'
import { rateLimiter } from '@/server/auth/ratelimit'
import { issueMagicLink } from '@/server/auth/magic-link'
import { magicLinkMail, mailConfigFor, sendMail, deliversToRecipient } from '@/server/auth/mail'
import { authConfig } from '@/server/auth/config'
import { claimInstallation, SetupError } from '@/server/settings/setup'

/**
 * Claiming a fresh installation.
 *
 * Unlike the login form next door, this one answers honestly: there is no
 * account to enumerate yet, and somebody following setup instructions needs to
 * know whether the key was wrong or the address malformed. What it must not do
 * is let anyone try keys all afternoon.
 */
const attempts = rateLimiter({ limit: 10, windowMs: 60_000 })

export type SetupResult = { ok: true; email: string; link?: string } | { ok: false; error: string }

export async function claim(formData: FormData): Promise<SetupResult> {
  const caller = clientAddress(await headers())
  if (!attempts.take(caller)) {
    return { ok: false, error: 'Zu viele Versuche. Bitte eine Minute warten.' }
  }

  try {
    const email = await claimInstallation(
      String(formData.get('email') ?? ''),
      String(formData.get('token') ?? ''),
    )

    const issued = await issueMagicLink(email, authConfig.defaultTenantId)
    if (!issued) return { ok: true, email }

    const config = await mailConfigFor(authConfig.defaultTenantId)
    if (!deliversToRecipient(config)) {
      // No relay configured yet -- which is the normal state five seconds into
      // an installation. Showing the link is not a leak here: the person
      // holding the setup key has just proved they are the operator.
      return { ok: true, email, link: issued.link }
    }

    try {
      await sendMail(magicLinkMail(issued.email, issued.link), authConfig.defaultTenantId)
      return { ok: true, email }
    } catch (error) {
      console.error('setup: magic link delivery failed', { error })
      // The account exists either way; withholding the link would leave the
      // operator locked out of the installation they just claimed.
      return { ok: true, email, link: issued.link }
    }
  } catch (error) {
    if (error instanceof SetupError) return { ok: false, error: error.message }
    console.error('setup failed', { error })
    return { ok: false, error: 'Die Einrichtung ist fehlgeschlagen. Details stehen im Log.' }
  }
}
