'use server'

import { headers } from 'next/headers'
import { clientAddress } from '@/server/auth/client-address'
import { rateLimiter } from '@/server/auth/ratelimit'
import { redeemShareToken } from '@/server/auth/share-invite'
import { hashSecret } from '@/server/auth/tokens'
import { firstDayOf } from '@/domain/workshop/repo'
import { withTenantOnly } from '@/server/db'

/**
 * Keyed by the token AND the caller, because the two protect different things.
 *
 * The token cannot be guessed -- it is 256 bits. What can be guessed is the
 * ADDRESS a known link belongs to, and a link is not a secret in the way a
 * password is: it sits in an inbox, in a browser history, in a forwarded mail.
 * So somebody holding one gets a handful of attempts at the second factor and
 * then has to wait, which turns a list of plausible addresses from a script into
 * an afternoon.
 *
 * Hashed rather than raw: this key ends up in process memory, and the whole point
 * of storing only hashes in the database is that a working link should not be
 * lying around anywhere it does not have to be.
 */
const attempts = rateLimiter({ limit: 10, windowMs: 60_000 })

export type GateResult =
  { ok: true; dayId: string } | { ok: false; reason: 'rejected' | 'tooMany' | 'noDays' }

/**
 * Trades a token plus the invited address for a guest session.
 *
 * One failure answer for every wrong input -- unknown token, revoked link, past
 * the last day, wrong address. The person who received the invitation has exactly
 * one correct answer and it is in their mail; anybody else must not learn which
 * half they got right.
 */
export async function openSharedAgenda(token: string, formData: FormData): Promise<GateResult> {
  const email = String(formData.get('email') ?? '')
  const requestHeaders = await headers()
  const caller = clientAddress(requestHeaders)

  if (!attempts.take(`${hashSecret(token)}:${caller}`)) {
    return { ok: false, reason: 'tooMany' }
  }

  const redeemed = await redeemShareToken(token, email, {
    userAgent: requestHeaders.get('user-agent') ?? undefined,
    ip: caller === 'unknown' ? undefined : caller,
  })
  if (!redeemed) return { ok: false, reason: 'rejected' }

  // Where to land. The guest never gets to name a day, so the first one is
  // resolved here rather than trusted from a form field.
  const dayId = await withTenantOnly(redeemed.tenantId, (tx) => firstDayOf(tx, redeemed.workshopId))
  // A workshop with no days at all: the session is real and the invitation
  // worked, so this is not 'rejected'. It is nothing to show yet.
  if (!dayId) return { ok: false, reason: 'noDays' }

  return { ok: true, dayId }
}
