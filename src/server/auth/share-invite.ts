import { and, eq, isNull } from 'drizzle-orm'
import { withTenantOnly } from '@/server/db'
import { workshop, workshopShareLink } from '@/server/db/schema'
import { lastDayOf } from '@/domain/workshop/share-links'
import { isExpired, normaliseEmail } from '@/domain/workshop/share-rules'
import { authConfig } from './config'
import { generateSecret, hashSecret } from './tokens'
import { createGuestSession } from './share-session'

/**
 * Turning an invitation into a session.
 *
 * The token is 256 bits of randomness, stored only as a SHA-256 hash -- the same
 * treatment magic links and personal access tokens get, for the reason given in
 * tokens.ts: there is no dictionary to slow down, only a lookup to keep
 * constant-time.
 *
 * Where this deliberately differs from a magic link: THE TOKEN IS NOT CONSUMED
 * ON USE. A magic link is single-use because it hands over an account, and a
 * prefetching mail client burning one is a feature. A share link is a durable
 * address for one agenda -- the guest will open it again tomorrow, from their
 * phone, in the room -- so single use would make it work exactly once, usually
 * inside the mail client's link preview.
 *
 * What replaces that protection is the second factor: the token alone shows a
 * form, and only the address the invitation was sent to opens the agenda. A
 * forwarded link is not a key.
 */

export function shareLinkUrl(token: string): string {
  // Always from GW_APP_URL, never from the request: behind a reverse proxy --
  // the normal deployment -- a request's own URL carries the container's
  // internal bind address, and the invitation would point at http://0.0.0.0:3000.
  return new URL(`/s/${token}`, authConfig.appUrl).toString()
}

/** A fresh token and the hash to store for it. */
export function newShareToken(): { token: string; tokenHash: string } {
  const token = generateSecret(32)
  return { token, tokenHash: hashSecret(token) }
}

export type ShareGate = {
  linkId: string
  tenantId: string
  workshopTitle: string
}

/**
 * What the gate at /s/<token> may show before anybody has proved anything.
 *
 * The workshop's title, and nothing else -- no day content, no agenda, not the
 * invited address. Somebody holding the link already received it by mail, so the
 * title tells them which invitation this is; the address would tell a finder of
 * the link what to type in.
 *
 * `null` for a token that is unknown, revoked or past the agenda's last day --
 * one answer for all three, because distinguishing them would confirm to a
 * stranger that a link exists.
 */
export async function readShareGate(token: string): Promise<ShareGate | null> {
  const tokenHash = hashSecret(token)

  /**
   * Without a tenant context, and that is the point: the tenant is what a token
   * is being resolved INTO. Every policy compares against app.current_tenant(),
   * which is unset here, so `tenant_id = NULL` is NULL and every policied table
   * reads back zero rows -- fail-closed by construction, exactly as
   * src/server/db/index.ts describes for PAT resolution.
   *
   * Which is why this cannot be an ordinary query, and why the token is resolved
   * through withTenantOnly across the tenants an install has. The Community
   * Edition has one, fixed; a Cloud Edition would resolve the token through a
   * SECURITY DEFINER function the way app.resolve_pat does, and this is the seam
   * where that goes.
   */
  const rows = await withTenantOnly(authConfig.defaultTenantId, (tx) =>
    tx
      .select({
        linkId: workshopShareLink.id,
        tenantId: workshopShareLink.tenantId,
        workshopId: workshopShareLink.workshopId,
        explicitExpiry: workshopShareLink.expiresAt,
        title: workshop.title,
      })
      .from(workshopShareLink)
      .innerJoin(workshop, eq(workshop.id, workshopShareLink.workshopId))
      .where(
        and(
          eq(workshopShareLink.tokenHash, tokenHash),
          isNull(workshopShareLink.revokedAt),
          // A workshop in the bin is gone for its guests too.
          isNull(workshop.deletedAt),
        ),
      )
      .limit(1),
  )

  const row = rows[0]
  if (!row) return null

  const lastDay = await withTenantOnly(row.tenantId, (tx) => lastDayOf(tx, row.workshopId))
  if (isExpired(lastDay, row.explicitExpiry)) return null

  return { linkId: row.linkId, tenantId: row.tenantId, workshopTitle: row.title }
}

/**
 * Redeems a token against the address it was sent to.
 *
 * Returns the workshop on success and `null` for every kind of failure -- wrong
 * token, wrong address, revoked, expired. One answer, because the caller must not
 * be able to tell a stranger which half they got right: "that token exists but
 * the address is wrong" turns a leaked link into an address-guessing game with a
 * progress indicator.
 *
 * The comparison itself goes through the database's `citext`, so it is
 * case-insensitive the same way the unique constraint is. No timing-safe compare:
 * the secret here is the token, which was already matched by hash, and an address
 * is not a secret -- what protects it is the rate limit at the call site.
 */
export async function redeemShareToken(
  token: string,
  rawEmail: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<{ workshopId: string; tenantId: string } | null> {
  const gate = await readShareGate(token)
  if (!gate) return null

  let email: string
  try {
    email = normaliseEmail(rawEmail)
  } catch {
    // A malformed address is a wrong address here, not a form error: the person
    // has one correct answer and it is in their inbox.
    return null
  }

  const rows = await withTenantOnly(gate.tenantId, (tx) =>
    tx
      .select({
        id: workshopShareLink.id,
        workshopId: workshopShareLink.workshopId,
      })
      .from(workshopShareLink)
      .where(and(eq(workshopShareLink.id, gate.linkId), eq(workshopShareLink.email, email)))
      .limit(1),
  )

  const link = rows[0]
  if (!link) return null

  await createGuestSession({ id: link.id, tenantId: gate.tenantId }, meta)
  return { workshopId: link.workshopId, tenantId: gate.tenantId }
}
