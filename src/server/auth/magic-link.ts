import { randomUUID } from 'node:crypto'
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm'
import { withAuth, withTenantOnly } from '@/server/db'
import { emailToken, identity, member } from '@/server/db/schema'
import { authConfig } from './config'
import { edition } from '@/server/edition'
import { generateSecret, hashSecret } from './tokens'
import { magicLinkMail, sendMail } from './mail'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'
import { asLocale } from '@/i18n/resolve'

/**
 * E-mail token login.
 *
 * A full, standalone way in -- not a fallback. Passkeys need HTTPS, and an
 * install on a LAN address has none, so this path has to work on its own or
 * that install has no login at all.
 */

/**
 * `locale` is the RECIPIENT's, which is why it comes back from here.
 *
 * The row is already being read to check the identity exists and is active, so
 * carrying the language out costs nothing -- and the alternative, looking it up
 * again at the send site, would be a second query in a different transaction
 * and a second chance to forget.
 */
export type IssueResult = {
  link: string
  email: string
  locale: Locale
  /** The tenant the link signs into -- and whose mail settings send it. */
  tenantId: string
}

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
  /**
   * Known when the caller already acts inside a tenant -- an invitation, first
   * setup. Left out on the login form, where the edition decides which tenant
   * this person signs into.
   */
  knownTenantId?: string,
  meta: { ip?: string } = {},
): Promise<IssueResult | null> {
  const normalised = emailAddress.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) return null

  return withAuth(async (tx) => {
    // FOR UPDATE is what makes the limit below a limit. Counting and inserting
    // are two statements, and without a lock twelve requests fired together
    // all count the same "fewer than five" and all send a mail. With it they
    // queue behind each other on this one row, and because every statement in
    // READ COMMITTED takes a fresh snapshot, each count sees the tokens the
    // requests before it committed.
    //
    // The identity row rather than an advisory lock: it exists exactly when a
    // mail can go out at all, it names one address and no other, and an unknown
    // address -- which never gets past the return below -- locks nothing.
    const rows = await tx
      .select({ identityId: identity.id, status: identity.status, locale: identity.locale })
      .from(identity)
      .where(eq(identity.email, normalised))
      .limit(1)
      .for('update')

    const found = rows[0]
    if (!found || found.status !== 'active') return null

    const tenantId = knownTenantId ?? (await edition.tenantForSignIn(found.identityId))
    // No tenant to sign into is the same silence as no account.
    if (!tenantId) return null

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
      // Untrusted despite the column being NOT NULL: it is a documented seam
      // for OIDC/SAML imports and carries no check constraint.
      locale: asLocale(found.locale) ?? DEFAULT_LOCALE,
      tenantId,
    }
  })
}

export async function sendMagicLink(emailAddress: string): Promise<void> {
  const issued = await issueMagicLink(emailAddress)
  // Nothing to send is not an error the caller may distinguish -- see above.
  if (!issued) return
  await sendMail(magicLinkMail(issued.email, issued.link, issued.locale), issued.tenantId)
}

/**
 * Whether a token would be accepted, without spending it.
 *
 * What /verify does on GET. Scanners open links before people do -- Microsoft
 * Defender's Safe Links rewrites and fetches every URL in a Microsoft 365
 * mailbox, and iOS renders a preview -- and when that GET consumed the token,
 * the person arrived to "expired" on every single attempt. Only the button on
 * the page consumes, because a scanner fetches and does not submit forms.
 *
 * The same conditions as consumeMagicLink, so the page does not offer a button
 * that is certain to fail. It stays an answer about THIS moment: the UPDATE
 * there is still what decides.
 */
export async function peekMagicLink(secret: string): Promise<boolean> {
  const tokenHash = hashSecret(secret)

  return withAuth(async (tx) => {
    const rows = await tx
      .select({ id: emailToken.id })
      .from(emailToken)
      .where(
        and(
          eq(emailToken.tokenHash, tokenHash),
          isNull(emailToken.consumedAt),
          gt(emailToken.expiresAt, new Date()),
          eq(emailToken.purpose, 'login'),
        ),
      )
      .limit(1)

    return rows.length > 0
  })
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
