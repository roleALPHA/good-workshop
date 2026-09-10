'use server'

import { headers } from 'next/headers'
import { sendMagicLink } from '@/server/auth/magic-link'

/**
 * Always resolves, whatever the address.
 *
 * The caller renders "check your inbox" unconditionally: telling an anonymous
 * visitor which addresses have accounts turns this form into an enumeration
 * oracle, and it is reachable by anyone.
 */
export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
  const forwardedFor = (await headers()).get('x-forwarded-for') ?? undefined

  try {
    await sendMagicLink(email)
  } catch (error) {
    // Delivery problems are an operator concern, not something to leak to the
    // form. GW_MAIL_TRANSPORT=none throws here by design.
    console.error('magic link delivery failed', { error, ip: forwardedFor })
  }
}
