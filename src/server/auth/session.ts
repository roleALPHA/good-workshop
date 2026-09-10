import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { withAuth } from '@/server/db'
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

const COOKIE_NAME = '__Host-gw_session'

export type SessionUser = {
  sessionId: string
  identityId: string
  email: string
  displayName: string
  tenantId: string
  memberId: string
  tenantRole: 'member' | 'admin'
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

  const store = await cookies()
  store.set(COOKIE_NAME, `${sessionId}.${secret}`, {
    httpOnly: true,
    // __Host- requires Secure, and browsers make an exception for localhost so
    // development still works over http.
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return null

  const separator = raw.indexOf('.')
  if (separator < 0) return null
  const sessionId = raw.slice(0, separator)
  const secret = raw.slice(separator + 1)

  return withAuth(async (tx) => {
    const rows = await tx
      .select({
        secretHash: authSession.secretHash,
        identityId: authSession.identityId,
        tenantId: authSession.activeTenantId,
        email: identity.email,
        displayName: identity.displayName,
        identityStatus: identity.status,
      })
      .from(authSession)
      .innerJoin(identity, eq(identity.id, authSession.identityId))
      .where(
        and(
          eq(authSession.id, sessionId),
          isNull(authSession.revokedAt),
          gt(authSession.expiresAt, new Date()),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row || !verifySecret(secret, row.secretHash)) return null
    if (row.identityStatus !== 'active' || !row.tenantId) return null

    // The membership is re-read on every request rather than baked into the
    // cookie: a revoked member must lose access immediately, and a role change
    // must not wait for a re-login.
    const memberships = await tx
      .select({ id: member.id, role: member.role, status: member.status })
      .from(member)
      .where(and(eq(member.tenantId, row.tenantId), eq(member.identityId, row.identityId)))
      .limit(1)

    const membership = memberships[0]
    if (!membership || membership.status !== 'active') return null

    await tx
      .update(authSession)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(authSession.id, sessionId))

    return {
      sessionId,
      identityId: row.identityId,
      email: row.email,
      displayName: row.displayName,
      tenantId: row.tenantId,
      memberId: membership.id,
      tenantRole: membership.role as 'member' | 'admin',
    }
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (raw) {
    const sessionId = raw.slice(0, raw.indexOf('.'))
    await withAuth((tx) =>
      tx
        .update(authSession)
        .set({ revokedAt: sql`now()` })
        .where(eq(authSession.id, sessionId)),
    )
  }
  store.delete(COOKIE_NAME)
}
