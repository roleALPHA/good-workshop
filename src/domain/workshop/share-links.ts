import { randomUUID } from 'node:crypto'
import { and, eq, isNull, max, sql } from 'drizzle-orm'
import type { WorkshopAccess } from '@/domain/agenda/access'
import type { Tx } from '@/server/db'
import { workshopDay, workshopShareLink } from '@/server/db/schema'
import { normaliseEmail, ShareLinkError, validUntil, type ShareRole } from './share-rules'

/**
 * Access to ONE workshop for somebody with no account.
 *
 * The sibling of collaborators.ts, and the distinction between them is the whole
 * design. A collaborator is a `member`, and a member is an `identity` -- global,
 * shared across tenants, which is why that screen refuses e-mail addresses.
 *
 * A share link is not that. It creates no identity and no membership; the row
 * lives in one tenant under RLS and names one workshop. The address on it is not
 * an identity, it is the second factor: the invited person types it in at
 * /s/<token>, so a link that was forwarded, leaked from an inbox or found in a
 * browser history is not on its own a key.
 *
 * The rules with no rows in them -- when a link expires, what counts as an
 * address -- are in share-rules.ts, where a unit test table can reach them.
 */

export type ShareLink = {
  id: string
  email: string
  role: ShareRole
  createdAt: Date
  lastSeenAt: Date | null
  /** When access ends. `null` means "until it is revoked" -- see validUntil. */
  expiresAt: Date | null
}

/** The last dated day of a workshop, or null when none of them carries a date. */
export async function lastDayOf(tx: Tx, workshopId: string): Promise<string | null> {
  const rows = await tx
    .select({ last: max(workshopDay.date) })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, workshopId))

  return rows[0]?.last ?? null
}

export async function listShareLinks(tx: Tx, access: WorkshopAccess): Promise<ShareLink[]> {
  const [rows, lastDay] = await Promise.all([
    tx
      .select({
        id: workshopShareLink.id,
        email: workshopShareLink.email,
        role: workshopShareLink.role,
        createdAt: workshopShareLink.createdAt,
        lastSeenAt: workshopShareLink.lastSeenAt,
        expiresAt: workshopShareLink.expiresAt,
      })
      .from(workshopShareLink)
      .where(
        and(
          eq(workshopShareLink.workshopId, access.workshopId),
          // A revoked link is gone, not greyed out: leaving it on the screen
          // invites the question of whether it still works.
          isNull(workshopShareLink.revokedAt),
        ),
      ),
    lastDayOf(tx, access.workshopId),
  ])

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role === 'editor' ? 'editor' : 'viewer',
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: validUntil(lastDay, row.expiresAt),
  }))
}

/**
 * Invites one address, or re-invites it.
 *
 * Returns the token exactly once -- only its hash is stored, so there is no
 * later opportunity to show the link again. Re-inviting an address that already
 * has a link replaces the token: the previous mail stops working, which is the
 * behaviour somebody re-sending an invitation expects, and it means a link that
 * went to the wrong inbox can be superseded without a separate revoke.
 */
export async function createShareLink(
  tx: Tx,
  access: WorkshopAccess,
  rawEmail: string,
  role: ShareRole,
  tokenHash: string,
): Promise<{ id: string; email: string }> {
  const email = normaliseEmail(rawEmail)
  const id = randomUUID()

  const rows = await tx
    .insert(workshopShareLink)
    .values({
      id,
      workshopId: access.workshopId,
      email,
      role,
      tokenHash,
      createdBy: access.actor.memberId,
    })
    .onConflictDoUpdate({
      target: [workshopShareLink.tenantId, workshopShareLink.workshopId, workshopShareLink.email],
      set: {
        role,
        tokenHash,
        // A re-invitation un-revokes: the member's intent is "this person should
        // have access", and making them revoke-then-invite would be a puzzle.
        revokedAt: null,
        lastSeenAt: null,
        createdBy: access.actor.memberId,
        createdAt: sql`now()`,
      },
    })
    .returning({ id: workshopShareLink.id })

  return { id: rows[0]?.id ?? id, email }
}

/**
 * Ends an invitation.
 *
 * The sessions opened with it go with it, through the composite FK's ON DELETE
 * CASCADE -- but the row is kept and marked instead of deleted, so that the
 * guest's open page fails on its next request rather than on nothing at all.
 * `verifyGuestCookie` re-reads this column every time for exactly that reason.
 */
export async function revokeShareLink(
  tx: Tx,
  access: WorkshopAccess,
  linkId: string,
): Promise<void> {
  const rows = await tx
    .update(workshopShareLink)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(workshopShareLink.id, linkId),
        eq(workshopShareLink.workshopId, access.workshopId),
        isNull(workshopShareLink.revokedAt),
      ),
    )
    .returning({ id: workshopShareLink.id })

  if (!rows[0]) throw new ShareLinkError('sharing.linkGone')
}
