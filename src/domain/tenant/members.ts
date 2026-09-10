import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import { withAuth, withTenant } from '@/server/db'
import { identity, member } from '@/server/db/schema'

/**
 * Who belongs to this tenant.
 *
 * Every read here is two queries on purpose. Member rows are tenant data and
 * live behind RLS; e-mail addresses live in the global identity table, which
 * `gw_app` cannot read at all -- reaching them means stepping into `gw_auth`
 * for exactly that one query. A join across the boundary is impossible by
 * construction, which is the point of the boundary.
 */

export type TenantRole = 'member' | 'admin'
export type MemberStatus = 'invited' | 'active' | 'disabled'

export type MemberRow = {
  id: string
  email: string
  displayName: string
  role: TenantRole
  status: MemberStatus
  isSelf: boolean
}

export class MemberError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemberError'
  }
}

/** Tenant administration is not a per-workshop capability; it is this check. */
export function assertTenantAdmin(actor: Actor): void {
  if (actor.tenantRole !== 'admin') {
    throw new MemberError('Nur Tenant-Admins dürfen Mitglieder verwalten.')
  }
}

/** The administrative list. Everything, including who is switched off. */
export async function listMembers(actor: Actor): Promise<MemberRow[]> {
  assertTenantAdmin(actor)
  return readMembers(actor)
}

/**
 * The list any member may read, to pick a colleague to share a workshop with.
 *
 * Colleagues inside one tenant can see each other by name -- that is what
 * sharing requires, and hiding it would only mean typing an address and hoping.
 * Disabled members are left out: offering somebody who cannot sign in is an
 * invitation to a support ticket.
 *
 * A separate function rather than a flag, because the alternative that
 * suggested itself -- calling the administrative one with a forged admin role
 * -- defeats its own guard and would keep defeating it after the guard grew
 * teeth.
 */
export async function listDirectory(actor: Actor): Promise<MemberRow[]> {
  const rows = await readMembers(actor)
  return rows.filter((row) => row.status !== 'disabled')
}

async function readMembers(actor: Actor): Promise<MemberRow[]> {
  const rows = await withTenant(actor, (tx) =>
    tx
      .select({
        id: member.id,
        identityId: member.identityId,
        role: member.role,
        status: member.status,
        displayName: member.displayName,
      })
      .from(member)
      .orderBy(asc(member.createdAt)),
  )
  if (rows.length === 0) return []

  const identities = await withAuth((tx) =>
    tx
      .select({ id: identity.id, email: identity.email, displayName: identity.displayName })
      .from(identity)
      .where(
        inArray(
          identity.id,
          rows.map((row) => row.identityId),
        ),
      ),
  )
  const byId = new Map(identities.map((row) => [row.id, row]))

  return rows.map((row) => {
    const person = byId.get(row.identityId)
    return {
      id: row.id,
      email: person?.email ?? '',
      displayName: row.displayName || person?.displayName || '',
      role: row.role === 'admin' ? 'admin' : 'member',
      status: row.status as MemberStatus,
      isSelf: row.id === actor.memberId,
    }
  })
}

export type InviteResult = { memberId: string; email: string; alreadyMember: boolean }

/**
 * Adds somebody to the tenant, creating their identity if this is their first.
 *
 * The membership starts as `invited`; following a login link activates it. An
 * admin cannot make somebody active by fiat -- that would let one turn an
 * address they do not control into a working account.
 */
export async function inviteMember(
  actor: Actor,
  emailAddress: string,
  role: TenantRole,
): Promise<InviteResult> {
  assertTenantAdmin(actor)

  const email = emailAddress.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new MemberError('Das ist keine gültige E-Mail-Adresse.')
  }

  const identityId = await withAuth(async (tx) => {
    const existing = await tx
      .select({ id: identity.id })
      .from(identity)
      .where(eq(identity.email, email))
      .limit(1)
    if (existing[0]) return existing[0].id

    const created = await tx
      .insert(identity)
      .values({ id: randomUUID(), email })
      .returning({ id: identity.id })
    return created[0]!.id
  })

  return withTenant(actor, async (tx) => {
    const existing = await tx
      .select({ id: member.id })
      .from(member)
      .where(eq(member.identityId, identityId))
      .limit(1)

    if (existing[0]) {
      return { memberId: existing[0].id, email, alreadyMember: true }
    }

    const created = await tx
      .insert(member)
      .values({
        id: randomUUID(),
        // Spelled out because `member` is one of the few tenant tables whose
        // tenant_id carries no `app.current_tenant()` default -- it is written
        // during bootstrap, before there is a context to default from.
        tenantId: actor.tenantId,
        identityId,
        role,
        status: 'invited',
        invitedBy: actor.memberId,
      })
      .returning({ id: member.id })

    return { memberId: created[0]!.id, email, alreadyMember: false }
  })
}

export async function setMemberRole(
  actor: Actor,
  memberId: string,
  role: TenantRole,
): Promise<void> {
  assertTenantAdmin(actor)

  await withTenant(actor, async (tx) => {
    // A tenant with no admins left can only be repaired from the command line
    // on the server. Refusing here is the difference between an error message
    // and somebody needing shell access to their own installation.
    if (role === 'member') await assertAnotherAdminRemains(tx, memberId)

    const updated = await tx
      .update(member)
      .set({ role, updatedAt: sql`now()` })
      .where(eq(member.id, memberId))
      .returning({ id: member.id })

    if (!updated[0]) throw new MemberError('Dieses Mitglied gibt es nicht.')
  })
}

export async function setMemberStatus(
  actor: Actor,
  memberId: string,
  status: Exclude<MemberStatus, 'invited'>,
): Promise<void> {
  assertTenantAdmin(actor)

  if (memberId === actor.memberId && status === 'disabled') {
    throw new MemberError('Du kannst dich nicht selbst abschalten.')
  }

  await withTenant(actor, async (tx) => {
    if (status === 'disabled') await assertAnotherAdminRemains(tx, memberId)

    const updated = await tx
      .update(member)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(member.id, memberId))
      .returning({ id: member.id })

    if (!updated[0]) throw new MemberError('Dieses Mitglied gibt es nicht.')
  })
}

async function assertAnotherAdminRemains(tx: Tx, exceptMemberId: string): Promise<void> {
  const others = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .where(
      and(eq(member.role, 'admin'), eq(member.status, 'active'), ne(member.id, exceptMemberId)),
    )

  if ((others[0]?.count ?? 0) === 0) {
    throw new MemberError(
      'Das ist der letzte aktive Admin. Mach zuerst jemand anderen zum Admin — sonst kommt niemand mehr an die Verwaltung.',
    )
  }
}
