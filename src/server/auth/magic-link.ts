import { randomUUID } from 'node:crypto'
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm'
import { withAuth, withTenantOnly } from '@/server/db'
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
/**
 * How many links one address may be sent in the window. Generous on purpose: a
 * person who lost the first mail, opened the second on the wrong device and
 * asked again must not be locked out of their own account. The number that
 * matters is the one an attacker cannot use to fill an inbox.
 */
const MAGIC_LINK_BURST = 5
const MAGIC_LINK_WINDOW_MS = 15 * 60_000

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

    // Counted in the database rather than in this process: /login is anonymous,
    // the mail goes out through the operator's relay, and a limit that resets
    // per replica is not a limit. `email_token_rate_idx` on (email, created_at)
    // has existed since the first migration for exactly this query -- it was
    // simply never asked.
    //
    // Silent, like every other refusal on this path: telling the caller they
    // hit a limit for this address confirms the address has an account.
    const recent = await tx
      .select({ n: count() })
      .from(emailToken)
      .where(
        and(
          eq(emailToken.email, normalised),
          gt(emailToken.createdAt, new Date(Date.now() - MAGIC_LINK_WINDOW_MS)),
        ),
      )
    if ((recent[0]?.n ?? 0) >= MAGIC_LINK_BURST) return null

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
    // `purpose` was selected and never looked at. Only 'login' is written
    // today, so nothing was wrong -- but the check constraint already allows
    // 'invite' and 'email_change', and the day an address-change flow lands,
    // its token would have been a login for the account it was meant to
    // re-verify. Checked here so that day is uneventful.
    if (token.purpose !== 'login') return null

    await tx
      .update(identity)
      .set({ emailVerifiedAt: sql`now()`, lastLoginAt: sql`now()` })
      .where(eq(identity.id, token.identityId))

    return { identityId: token.identityId, tenantId: token.tenantId, email: token.email }
  })
}

/**
 * Activates an invited member on first successful login, and returns the id it
 * acted as.
 *
 * The id matters. This used to pass `memberId: identityId` into withTenant,
 * putting an identity UUID into `app.member_id`. No policy reads
 * app.current_member() yet, so nothing misbehaved -- but the accessor exists,
 * and the first policy written against it would have compared the wrong column
 * with nothing to show for it. Returning the id makes the distinction
 * something a test can hold on to rather than a convention.
 */
export async function activateMembership(
  identityId: string,
  tenantId: string,
): Promise<string | null> {
  // withTenantOnly, which exists for exactly this shape: the tenant is known,
  // the member is the row we are about to read. The policies here compare
  // tenant_id only, so an unset member is safe.
  return withTenantOnly(tenantId, async (tx) => {
    const rows = await tx
      .update(member)
      .set({ status: 'active' })
      .where(and(eq(member.identityId, identityId), eq(member.status, 'invited')))
      .returning({ id: member.id })

    if (rows[0]) return rows[0].id

    // Already active: still answer with the member id, because the caller asked
    // who this identity is in this tenant, not whether a row changed.
    const existing = await tx
      .select({ id: member.id })
      .from(member)
      .where(eq(member.identityId, identityId))
      .limit(1)

    return existing[0]?.id ?? null
  })
}
