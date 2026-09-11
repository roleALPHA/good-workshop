import { randomUUID, timingSafeEqual } from 'node:crypto'
import { and, count, eq } from 'drizzle-orm'
import { withAuth, withTenantOnly } from '@/server/db'
import { identity, member } from '@/server/db/schema'
import { authConfig } from '@/server/auth/config'
import { generateSecret } from '@/server/auth/tokens'

/**
 * First-run setup: the one screen that turns a fresh deployment into an
 * installation somebody can use.
 *
 * WHAT IT REPLACES. Until now the first administrator came from a shell --
 * `cli.mjs admin create` -- or from GW_BOOTSTRAP_ADMIN_EMAIL, a variable one
 * sets before the very first start and removes afterwards. Both assume the
 * person setting up the product has a terminal on the server. Often they do
 * not, and the deployment then stands there, healthy and unusable.
 *
 * WHY IT IS NOT SIMPLY OPEN. A page that hands out the first administrator
 * account to whoever loads it is a takeover waiting for the gap between
 * `docker compose up` and the operator opening their browser -- a window that
 * is minutes wide on a machine reachable from the internet. So it is gated by a
 * token printed to stdout at startup: whoever can read `docker compose logs` is
 * the operator, which is exactly the same assumption the bootstrap admin link
 * already makes.
 *
 * WHY IT CLOSES ITSELF. Once an active admin exists there is nothing left to
 * claim, and the route is gone -- not merely hidden. An installation cannot be
 * talked into a second first-run.
 */

let setupToken: string | undefined

/**
 * The token for this process, created on first use.
 *
 * Held in memory rather than in the database on purpose: a restart invalidates
 * it, which is the right behaviour for a credential that exists only to bridge
 * the first few minutes. It is printed by the boot hook, next to the other
 * things an operator reads out of the log.
 */
export function currentSetupToken(): string {
  setupToken ??= generateSecret(24)
  return setupToken
}

export function setupTokenMatches(candidate: string): boolean {
  const expected = Buffer.from(currentSetupToken(), 'utf8')
  const given = Buffer.from(candidate.trim(), 'utf8')
  // Length first: timingSafeEqual throws on a mismatch, and the length of a
  // token is not the secret.
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Whether this installation still has nobody who could log in and configure it. */
export async function needsSetup(): Promise<boolean> {
  const tenantId = authConfig.defaultTenantId
  const rows = await withTenantOnly(tenantId, (tx) =>
    tx
      .select({ n: count() })
      .from(member)
      .where(
        and(eq(member.tenantId, tenantId), eq(member.role, 'admin'), eq(member.status, 'active')),
      ),
  )
  return (rows[0]?.n ?? 0) === 0
}

export class SetupError extends Error {}

/**
 * Creates the first administrator and returns the address to send a link to.
 *
 * Re-checks `needsSetup` inside the write rather than trusting the caller: two
 * browser tabs, or a retry on a slow connection, must not produce two claims on
 * an installation.
 */
export async function claimInstallation(emailAddress: string, token: string): Promise<string> {
  if (!setupTokenMatches(token)) {
    throw new SetupError('Der Einrichtungsschlüssel stimmt nicht.')
  }

  const normalised = emailAddress.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) {
    throw new SetupError('Das ist keine gültige E-Mail-Adresse.')
  }

  if (!(await needsSetup())) {
    throw new SetupError('Diese Installation hat bereits eine Administratorin.')
  }

  const tenantId = authConfig.defaultTenantId

  // The identity tables are unreachable for gw_app by design; withAuth is the
  // sanctioned door, and the privilege ends with the transaction.
  const identityId = await withAuth(async (tx) => {
    const existing = await tx
      .select({ id: identity.id })
      .from(identity)
      .where(eq(identity.email, normalised))
      .limit(1)

    const found = existing[0]?.id
    if (found) return found

    const created = await tx
      .insert(identity)
      .values({ id: randomUUID(), email: normalised })
      .returning({ id: identity.id })

    const row = created[0]
    if (!row) throw new SetupError('Die Identität konnte nicht angelegt werden.')
    return row.id
  })

  await withTenantOnly(tenantId, async (tx) => {
    if ((await adminCount(tx, tenantId)) > 0) {
      throw new SetupError('Diese Installation hat bereits eine Administratorin.')
    }
    await tx
      .insert(member)
      .values({ id: randomUUID(), tenantId, identityId, role: 'admin', status: 'active' })
      .onConflictDoUpdate({
        target: [member.tenantId, member.identityId],
        set: { role: 'admin', status: 'active' },
      })
  })

  return normalised
}

async function adminCount(
  tx: Parameters<Parameters<typeof withTenantOnly>[1]>[0],
  tenantId: string,
) {
  const rows = await tx
    .select({ n: count() })
    .from(member)
    .where(
      and(eq(member.tenantId, tenantId), eq(member.role, 'admin'), eq(member.status, 'active')),
    )
  return rows[0]?.n ?? 0
}
