'use server'

import { headers } from 'next/headers'
import { sendMagicLink } from '@/server/auth/magic-link'
import { clientAddress } from '@/server/auth/client-address'
import { rateLimiter } from '@/server/auth/ratelimit'

// Per address, on top of the per-recipient window that issueMagicLink counts in
// the database. That one stops an inbox being buried; this one stops a script
// walking a list of addresses to find out which ones have accounts by timing.
const requests = rateLimiter({ limit: 30, windowMs: 60_000 })

/**
 * Always resolves, whatever the address.
 *
 * The caller renders "check your inbox" unconditionally: telling an anonymous
 * visitor which addresses have accounts turns this form into an enumeration
 * oracle, and it is reachable by anyone.
 */
export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
  const caller = clientAddress(await headers())

  // Silently, like every other outcome here: a visible "too many requests"
  // would answer a question this endpoint refuses to answer.
  if (!requests.take(caller)) return

  try {
    await sendMagicLink(email)
  } catch (error) {
    // Delivery problems are an operator concern, not something to leak to the
    // form. GW_MAIL_TRANSPORT=none throws here by design.
    console.error('magic link delivery failed', { error, ip: caller })
  }
}
