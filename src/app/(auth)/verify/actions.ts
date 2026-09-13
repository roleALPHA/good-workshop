'use server'

import { headers } from 'next/headers'
import { activateMembership, consumeMagicLink } from '@/server/auth/magic-link'
import { createSession } from '@/server/auth/session'

/**
 * Spends a magic link and signs in.
 *
 * A Server Action rather than a POST route, for the Origin check Next does on
 * every action: without one, any site could submit a form that signs a visitor
 * into an account of the attacker's choosing.
 *
 * One failure answer for expired, spent and unknown, as before -- a visitor
 * learns nothing about which.
 */
export async function confirmMagicLink(token: string): Promise<{ ok: boolean }> {
  const consumed = await consumeMagicLink(token)
  if (!consumed) return { ok: false }

  await activateMembership(consumed.identityId, consumed.tenantId)
  await createSession(consumed.identityId, consumed.tenantId, 'magic_link', {
    userAgent: (await headers()).get('user-agent') ?? undefined,
  })

  return { ok: true }
}
