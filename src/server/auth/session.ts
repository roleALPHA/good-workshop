import { randomUUID } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { withAuth, withTenantOnly } from '@/server/db'
import { authSession, identity, member } from '@/server/db/schema'
import { authConfig } from './config'
import { generateSecret, hashSecret, verifySecret } from './tokens'

/**
 * Database-backed sessions, not JWTs.
 *
 * A tenant admin disabling somebody has to take effect now, not whenever a
 * token happens to expire. That is worth one indexed read per request.
 *
 * The cookie carries `<sessionId>.<secret>`: the id is the lookup key, the
 * secret is verified against a stored hash. A stolen database therefore yields
 * no usable cookies.
 */

/**
 * The cookie name depends on the deployment, and this is load-bearing.
 *
 * `__Host-` requires the Secure attribute, and a Secure cookie is NEVER sent
 * over plain http -- browsers make an exception for localhost, which is exactly
 * why this looks fine in development and fails on a LAN address. An on-prem
 * install on http://192.168.1.50:3000 would accept the magic link, set the
 * cookie, and then never send it back: login silently does nothing.
 *
 * So: the hardened name over https, a plain one otherwise. Both are read, so an
 * install that gains TLS later does not log everybody out.
 */
const SECURE_COOKIE = '__Host-gw_session'
const PLAIN_COOKIE = 'gw_session'

const cookieName = () => (authConfig.appUrl.protocol === 'https:' ? SECURE_COOKIE : PLAIN_COOKIE)

export type SessionUser = {
  sessionId: string
  identityId: string
  email: string
  displayName: string
  tenantId: string
  memberId: string
  tenantRole: 'member' | 'admin'
  /**
   * The person's own language choice, straight from identity.locale.
   *
   * Untrusted despite the column being `not null`: it is a documented seam for
   * OIDC/SAML imports and carries no check constraint, so src/i18n/resolve.ts
   * validates it rather than trusting the type.
   */
  locale: string
}

export async function createSession(
  identityId: string,
  tenantId: string,
  method: 'passkey' | 'magic_link',
  meta: { userAgent?: string; ip?: string } = {},
): Promise<void> {
  const sessionId = randomUUID()
  const secret = generateSecret(32)
  const expiresAt = new Date(Date.now() + authConfig.sessionTtlDays * 86_400_000)

  await withAuth(async (tx) => {
    await tx.insert(authSession).values({
      id: sessionId,
      identityId,
      activeTenantId: tenantId,
      secretHash: hashSecret(secret),
      method,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    })
  })

  const secure = authConfig.appUrl.protocol === 'https:'
  const store = await cookies()
  store.set(cookieName(), `${sessionId}.${secret}`, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies()
  // Both names are read: an install that gains TLS later keeps its sessions.
  const raw = store.get(SECURE_COOKIE)?.value ?? store.get(PLAIN_COOKIE)?.value
  return raw ? verifySessionCookie(raw) : null
}

/**
 * readSession, deduplicated within one render pass.
 *
 * The layout, the page and now src/i18n/request.ts all want the same session,
 * and each call is two indexed reads plus an idempotent `last_seen_at` write.
 * React's `cache` collapses them into one -- the same trick loadTenantBrand
 * uses in src/components/layout/tenant-brand.tsx, and the reason adding locale
 * resolution as a fourth caller is a net *reduction* in queries rather than a
 * new cost.
 *
 * Only for the request-scoped render pass. A Server Action that mutates the
 * session must still call readSession directly.
 */
export const readSessionCached = cache(readSession)

/** The cookie names, for callers that parse a raw Cookie header themselves. */
export const SESSION_COOKIE_NAMES = [SECURE_COOKIE, PLAIN_COOKIE] as const

/**
 * Validates a session cookie value.
 *
 * Split out from readSession because the collaboration server runs outside
 * Next and has no `next/headers` -- it parses the upgrade request's Cookie
 * header itself. A second implementation there would be a second place for the
 * rules about revocation and membership to drift.
 */
export async function verifySessionCookie(raw: string): Promise<SessionUser | null> {
  const separator = raw.indexOf('.')
  if (separator < 0) return null
  const sessionId = raw.slice(0, separator)
  const secret = raw.slice(separator + 1)

  /**
   * Two reads, one per role, because no query can join across the boundary:
   * the session and the identity live in tables gw_app cannot see at all, the
   * membership lives in a table gw_auth cannot see. That is the separation
   * doing its job, not an inconvenience to route around.
   */
  const account = await withAuth(async (tx) => {
    const rows = await tx
      .select({
        secretHash: authSession.secretHash,
        identityId: authSession.identityId,
        tenantId: authSession.activeTenantId,
        email: identity.email,
        displayName: identity.displayName,
        identityStatus: identity.status,
        locale: identity.locale,
      })
      .from(authSession)
      .innerJoin(identity, eq(identity.id, authSession.identityId))
      .where(
        and(
          eq(authSession.id, sessionId),
          isNull(authSession.revokedAt),
          gt(authSession.expiresAt, new Date()),
          // The idle window, alongside the absolute lifetime. `last_seen_at`
          // was written on every request and read by nothing, so a cookie
          // copied off a shared machine kept working for the full thirty days
          // after the person had walked away from it.
          gt(
            authSession.lastSeenAt,
            new Date(Date.now() - authConfig.sessionIdleDays * 86_400_000),
          ),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row || !verifySecret(secret, row.secretHash)) return null
    if (row.identityStatus !== 'active' || !row.tenantId) return null

    await tx
      .update(authSession)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(authSession.id, sessionId))

    return row
  })

  if (!account?.tenantId) return null

  // Re-read on every request rather than baked into the cookie: a revoked
  // member has to lose access now, and a role change must not wait for a
  // re-login.
  const membership = await withTenantOnly(account.tenantId, async (tx) => {
    const rows = await tx
      .select({ id: member.id, role: member.role, status: member.status })
      .from(member)
      .where(eq(member.identityId, account.identityId))
      .limit(1)
    return rows[0] ?? null
  })

  if (!membership || membership.status !== 'active') return null

  return {
    sessionId,
    identityId: account.identityId,
    email: account.email,
    displayName: account.displayName,
    tenantId: account.tenantId,
    memberId: membership.id,
    tenantRole: membership.role as 'member' | 'admin',
    locale: account.locale,
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const raw = store.get(SECURE_COOKIE)?.value ?? store.get(PLAIN_COOKIE)?.value
  if (raw) {
    const sessionId = raw.slice(0, raw.indexOf('.'))
    await withAuth((tx) =>
      tx
        .update(authSession)
        .set({ revokedAt: sql`now()` })
        .where(eq(authSession.id, sessionId)),
    )
  }
  store.delete(SECURE_COOKIE)
  store.delete(PLAIN_COOKIE)
}
