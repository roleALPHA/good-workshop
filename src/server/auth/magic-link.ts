import { randomUUID } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { withAuth, withTenant } from '@/server/db'
import { emailToken, identity, member } from '@/server/db/schema'
import { authConfig } from './config'
import { generateSecret, hashSecret } from './tokens'
import { magicLinkMail, sendMail } from './mail'

/**
 * E-mail token login.
 *
 * A full, standalone way in -- not a fallback. Passkeys need HTTPS, and an
 * install on a LAN address has none, so this path has to work on its own or
 * that install has no login at all.
 */

export type IssueResult = { link: string; email: string }

/**
 * Issues a link for an existing member.
 *
 * Deliberately silent about whether the address exists: the caller always
 * reports "check your inbox". Telling an anonymous visitor which e-mail
 * addresses have accounts is an enumeration oracle, and this endpoint is
 * reachable by anyone.
 */
export async function issueMagicLink(
  emailAddress: string,
  tenantId: string = authConfig.defaultTenantId,
  meta: { ip?: string } = {},
): Promise<IssueResult | null> {
  const normalised = emailAddress.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) return null

  return withAuth(async (tx) => {
    const rows = await tx
      .select({ identityId: identity.id, status: identity.status })
      .from(identity)
      .where(eq(identity.email, normalised))
      .limit(1)

    const found = rows[0]
    if (!found || found.status !== 'active') return null

    const secret = generateSecret(32)
    await tx.insert(emailToken).values({
      id: randomUUID(),
      purpose: 'login',
      email: normalised,
      identityId: found.identityId,
      tenantId,
      tokenHash: hashSecret(secret),
      expiresAt: new Date(Date.now() + authConfig.magicLinkTtlMinutes * 60_000),
      requestedIp: meta.ip ?? null,
    })

    return {
      email: normalised,
      link: new URL(`/verify?token=${secret}`, authConfig.appUrl).toString(),
    }
  })
}

export async function sendMagicLink(emailAddress: string, tenantId?: string): Promise<void> {
  const issued = await issueMagicLink(emailAddress, tenantId)
  // Nothing to send is not an error the caller may distinguish -- see above.
  if (!issued) return
  await sendMail(magicLinkMail(issued.email, issued.link))
}

export type ConsumedToken = { identityId: string; tenantId: string; email: string }

/**
 * Consumes a token, once.
 *
 * The UPDATE ... WHERE consumed_at IS NULL is what makes it single-use: two
 * concurrent requests race in the database, and exactly one of them updates a
 * row. Reading first and writing after would let both through.
 */
export async function consumeMagicLink(secret: string): Promise<ConsumedToken | null> {
  const tokenHash = hashSecret(secret)

  return withAuth(async (tx) => {
    const updated = await tx
      .update(emailToken)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(emailToken.tokenHash, tokenHash),
          isNull(emailToken.consumedAt),
          gt(emailToken.expiresAt, new Date()),
        ),
      )
      .returning({
        identityId: emailToken.identityId,
        tenantId: emailToken.tenantId,
        email: emailToken.email,
        purpose: emailToken.purpose,
      })

    const token = updated[0]
    if (!token?.identityId || !token.tenantId) return null

    await tx
      .update(identity)
      .set({ emailVerifiedAt: sql`now()`, lastLoginAt: sql`now()` })
      .where(eq(identity.id, token.identityId))

    return { identityId: token.identityId, tenantId: token.tenantId, email: token.email }
  })
}

/** Activates an invited member on first successful login. */
export async function activateMembership(identityId: string, tenantId: string): Promise<void> {
  await withTenant(
    { tenantId, memberId: identityId, tenantRole: 'member', source: 'system' },
    (tx) =>
      tx
        .update(member)
        .set({ status: 'active' })
        .where(and(eq(member.identityId, identityId), eq(member.status, 'invited'))),
  )
}
