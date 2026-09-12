import { randomUUID } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { withTenantOnly } from '@/server/db'
import type { Actor } from '@/server/db'
import { shareSession, workshopShareLink } from '@/server/db/schema'
import { lastDayOf } from '@/domain/workshop/share-links'
import { isExpired } from '@/domain/workshop/share-rules'
import { authConfig } from './config'
import { generateSecret, hashSecret, verifySecret } from './tokens'

/**
 * The session a guest gets after typing in the address their invitation went to.
 *
 * Built like src/server/auth/session.ts -- the id is the lookup key, the secret
 * is verified against a stored hash, so a stolen database yields no usable
 * cookies -- and deliberately NOT that module. Three differences carry the whole
 * security argument:
 *
 *  - A different TABLE. `auth_session` requires an `identity_id`, and an identity
 *    is global: minting one for a guest is exactly the cross-tenant access the
 *    collaborator screen refuses to grant. `share_session` cannot name an
 *    identity, so a guest session can never become a login. That is a property
 *    of the schema, not a rule somebody has to keep remembering.
 *  - A different COOKIE. A member opening their own invitation to check it would
 *    otherwise log themselves out -- and worse, the two credentials would share
 *    one slot, where one can be mistaken for the other.
 *  - It carries a GRANT rather than a membership: one workshop, one role. That
 *    grant is the only thing `effectiveRole` accepts from a guest, and this file
 *    is the only place that ever sets it.
 */

/**
 * `__Host-` over https, the plain name otherwise -- the same reasoning as the
 * member cookie, and the same consequence if it is ignored: a Secure cookie is
 * never sent over plain http, so an on-prem install on http://192.168.1.50:3000
 * would accept the invitation and then never get the cookie back. Both names are
 * read, so an install that gains TLS later does not throw its guests out.
 */
const SECURE_COOKIE = '__Host-gw_guest'
const PLAIN_COOKIE = 'gw_guest'

const cookieName = () => (authConfig.appUrl.protocol === 'https:' ? SECURE_COOKIE : PLAIN_COOKIE)

/** The cookie names, for callers that parse a raw Cookie header themselves. */
export const GUEST_COOKIE_NAMES = [SECURE_COOKIE, PLAIN_COOKIE] as const

export type GuestUser = {
  shareSessionId: string
  linkId: string
  tenantId: string
  workshopId: string
  /** The address the invitation went to. Doubles as the name in the presence strip. */
  email: string
  role: 'editor' | 'viewer'
}

/**
 * The cookie is `<tenantId>.<sessionId>.<secret>`.
 *
 * The tenant is in there because of RLS, and the alternative was worse. Every
 * policy compares against `app.current_tenant()`, so a lookup with no tenant set
 * reads zero rows from `share_session` -- correct, and useless when the tenant is
 * the thing being looked up. The other way out would be a SECURITY DEFINER
 * resolver like `app.resolve_pat`; that exists for personal access tokens
 * because a token is a bare string with nowhere to put anything else, which is
 * not true of a cookie we mint ourselves.
 *
 * It is not a secret and it is not a credential: a tampered tenant finds no row,
 * because the session is still located by its own id under that tenant's policy
 * and still has to match a 256-bit secret.
 */
function parseCookieValue(
  raw: string,
): { tenantId: string; sessionId: string; secret: string } | null {
  const first = raw.indexOf('.')
  if (first < 0) return null
  const second = raw.indexOf('.', first + 1)
  if (second < 0) return null

  const tenantId = raw.slice(0, first)
  const sessionId = raw.slice(first + 1, second)
  const secret = raw.slice(second + 1)

  // Both reach a uuid comparison, where Postgres raises 22P02 on a malformed
  // value rather than returning no rows. The cookie is attacker-controlled, so
  // this is input validation and not a formality.
  if (!isUuid(tenantId) || !isUuid(sessionId) || secret.length === 0) return null
  return { tenantId, sessionId, secret }
}

export async function createGuestSession(
  link: { id: string; tenantId: string },
  meta: { userAgent?: string; ip?: string } = {},
): Promise<void> {
  const sessionId = randomUUID()
  const secret = generateSecret(32)
  const expiresAt = new Date(Date.now() + authConfig.sessionTtlDays * 86_400_000)

  await withTenantOnly(link.tenantId, async (tx) => {
    await tx.insert(shareSession).values({
      id: sessionId,
      tenantId: link.tenantId,
      shareLinkId: link.id,
      secretHash: hashSecret(secret),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    })
    // So the inviting member can see whether the invitation was ever opened.
    await tx
      .update(workshopShareLink)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(workshopShareLink.id, link.id))
  })

  const store = await cookies()
  store.set(cookieName(), `${link.tenantId}.${sessionId}.${secret}`, {
    httpOnly: true,
    secure: authConfig.appUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function readGuestSession(): Promise<GuestUser | null> {
  const store = await cookies()
  const raw = store.get(SECURE_COOKIE)?.value ?? store.get(PLAIN_COOKIE)?.value
  return raw ? verifyGuestCookie(raw) : null
}

/** readGuestSession, deduplicated within one render pass -- as readSessionCached is. */
export const readGuestSessionCached = cache(readGuestSession)

/**
 * Validates a guest cookie and resolves the grant it carries.
 *
 * Split out from readGuestSession for the same reason verifySessionCookie is:
 * the collaboration server runs outside Next, has no `next/headers`, and parses
 * the upgrade request's Cookie header itself. A second implementation there
 * would be a second place for the rules about revocation and expiry to drift.
 *
 * Everything is re-read on EVERY request rather than baked into the cookie. A
 * withdrawn invitation has to stop working now; a role changed from write to read
 * must not wait for a re-login; and the deadline comes from the agenda, which
 * moves. That is the trade verifySessionCookie already makes for membership, for
 * the same reason, at the same cost of a couple of indexed reads.
 */
export async function verifyGuestCookie(raw: string): Promise<GuestUser | null> {
  const parsed = parseCookieValue(raw)
  if (!parsed) return null
  const { tenantId, sessionId, secret } = parsed

  return withTenantOnly(tenantId, async (tx) => {
    const rows = await tx
      .select({
        secretHash: shareSession.secretHash,
        linkId: workshopShareLink.id,
        workshopId: workshopShareLink.workshopId,
        email: workshopShareLink.email,
        role: workshopShareLink.role,
        explicitExpiry: workshopShareLink.expiresAt,
      })
      .from(shareSession)
      .innerJoin(
        workshopShareLink,
        and(
          eq(workshopShareLink.id, shareSession.shareLinkId),
          // Withdrawn means gone, from this request onwards.
          isNull(workshopShareLink.revokedAt),
        ),
      )
      .where(
        and(
          eq(shareSession.id, sessionId),
          isNull(shareSession.revokedAt),
          gt(shareSession.expiresAt, new Date()),
          // The idle window, alongside the absolute lifetime: a cookie left on a
          // borrowed machine stops working long before the session would.
          gt(
            shareSession.lastSeenAt,
            new Date(Date.now() - authConfig.sessionIdleDays * 86_400_000),
          ),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row || !verifySecret(secret, row.secretHash)) return null

    // The deadline the agenda sets, resolved here rather than at the call sites
    // so that a page and a collaboration socket cannot disagree about whether
    // this link is still alive.
    if (isExpired(await lastDayOf(tx, row.workshopId), row.explicitExpiry)) return null

    await tx
      .update(shareSession)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(shareSession.id, sessionId))

    return {
      shareSessionId: sessionId,
      linkId: row.linkId,
      tenantId,
      workshopId: row.workshopId,
      email: row.email,
      role: row.role === 'editor' ? ('editor' as const) : ('viewer' as const),
    }
  })
}

/**
 * The Actor a guest acts as.
 *
 * `memberId: null` because they are not a member. `tenantRole: 'member'` because
 * the field has no honest value here and 'member' is the one that grants nothing
 * -- `effectiveRole` returns before it ever looks, and this way a later reader of
 * the field cannot find an 'admin' sitting on a guest and draw a conclusion from
 * it.
 */
export function guestActor(guest: GuestUser): Actor {
  return {
    tenantId: guest.tenantId,
    memberId: null,
    tenantRole: 'member',
    displayName: guest.email,
    source: 'guest',
    share: { linkId: guest.linkId, workshopId: guest.workshopId, role: guest.role },
  }
}

/** Ends this browser's guest session. The invitation itself stays valid. */
export async function destroyGuestSession(): Promise<void> {
  const store = await cookies()
  const raw = store.get(SECURE_COOKIE)?.value ?? store.get(PLAIN_COOKIE)?.value
  const parsed = raw ? parseCookieValue(raw) : null

  if (parsed) {
    // No secret check: revoking a session named by a cookie the caller already
    // holds takes nothing away from anybody else, and refusing to sign somebody
    // out because their cookie was half-corrupt is the worse failure.
    await withTenantOnly(parsed.tenantId, (tx) =>
      tx
        .update(shareSession)
        .set({ revokedAt: sql`now()` })
        .where(eq(shareSession.id, parsed.sessionId)),
    )
  }

  store.delete(SECURE_COOKIE)
  store.delete(PLAIN_COOKIE)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: string): boolean {
  return UUID.test(value)
}
