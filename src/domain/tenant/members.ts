import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import { withAuth, withTenant } from '@/server/db'
import { folder, identity, member, workshop } from '@/server/db/schema'
import { DomainError } from '@/domain/errors'
import type { AssignablePerson } from '@/domain/agenda/responsible'
import type { Locale } from '@/i18n/config'

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
  /**
   * What would have to change hands if this member were removed.
   *
   * Carried on the administrative row rather than fetched when somebody opens
   * the confirmation, because the number is the warning: "3 Workshops, 1
   * Ordner" is what makes an admin stop and think about who should get them,
   * and a number that appears only after the decision has been started is a
   * number that arrives too late.
   */
  owns: MemberEstate
}

/** Workshops and folders that belong to one member. */
export type MemberEstate = { workshops: number; folders: number }

export function ownsSomething(estate: MemberEstate): boolean {
  return estate.workshops > 0 || estate.folders > 0
}

export class MemberError extends DomainError {}

/** Tenant administration is not a per-workshop capability; it is this check. */
export function assertTenantAdmin(actor: Actor): void {
  if (actor.tenantRole !== 'admin') {
    throw new MemberError('member.adminOnly')
  }
}

/**
 * The administrative list. Everything, including who is switched off, and what
 * each of them owns -- the latter only here, because only this screen can act
 * on it.
 */
export async function listMembers(actor: Actor): Promise<MemberRow[]> {
  assertTenantAdmin(actor)
  const rows = await readMembers(actor)
  if (rows.length === 0) return rows

  const estates = await withTenant(actor, (tx) => estatesOf(tx))
  return rows.map((row) => ({ ...row, owns: estates.get(row.id) ?? EMPTY_ESTATE }))
}

const EMPTY_ESTATE: MemberEstate = { workshops: 0, folders: 0 }

/**
 * Who owns how much, for the whole tenant, in one round trip.
 *
 * Two aggregates rather than one join: a member can own folders and no
 * workshops or the other way round, and joining the two tables would multiply
 * the rows and count each side by the other's cardinality. That bug reads as
 * "4 workshops" for somebody who owns two, which nobody checks against the
 * library before clicking.
 *
 * `folder.created_by` IS folder ownership -- see folderRoleFromPath in
 * domain/workshop/folder-access, which turns exactly that column into 'owner'.
 * It carries no foreign key, so nothing in the database would stop a member
 * from being deleted out from under a folder; this is what stops it.
 */
export async function estatesOf(tx: Tx): Promise<Map<string, MemberEstate>> {
  const [workshops, folders] = await Promise.all([
    tx
      .select({ memberId: workshop.ownerId, count: sql<number>`count(*)::int` })
      .from(workshop)
      .groupBy(workshop.ownerId),
    tx
      .select({ memberId: folder.createdBy, count: sql<number>`count(*)::int` })
      .from(folder)
      .groupBy(folder.createdBy),
  ])

  const estates = new Map<string, MemberEstate>()
  const at = (id: string) => {
    const found = estates.get(id) ?? { workshops: 0, folders: 0 }
    estates.set(id, found)
    return found
  }
  for (const row of workshops) if (row.memberId) at(row.memberId).workshops = row.count
  for (const row of folders) if (row.memberId) at(row.memberId).folders = row.count
  return estates
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

/**
 * The members somebody may put in charge of a block: an id and a name, and
 * nothing more.
 *
 * The name is what gets written into the agenda, and the agenda travels -- into
 * an export, onto paper, to a guest. So a member without a display name is
 * offered under the part of their address before the @ rather than the whole
 * of it: enough to recognise a colleague by, without putting their address
 * into every document the block ends up in.
 */
export async function listAssignable(actor: Actor): Promise<AssignablePerson[]> {
  const rows = await listDirectory(actor)
  return rows
    .map((row) => ({
      id: row.id,
      name: row.displayName.trim() || row.email.split('@')[0] || row.email,
    }))
    .filter((person) => person.name !== '')
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
      owns: EMPTY_ESTATE,
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
  /**
   * The language a brand-new identity starts in -- the inviting admin's.
   *
   * Seeded at creation rather than applied as a fallback when the mail goes
   * out, and the difference matters: `identity.locale` is NOT NULL DEFAULT
   * 'de', so a fresh row reads back as "chose German" and is indistinguishable
   * from a real preference. A per-send fallback would therefore work for the
   * invitation and silently revert for the next sign-in link six months later.
   *
   * An identity that already exists keeps whatever it chose. Being invited to a
   * second workspace is not a reason to have your language reset by whoever
   * invited you.
   */
  locale: Locale,
): Promise<InviteResult> {
  assertTenantAdmin(actor)

  const email = emailAddress.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new MemberError('member.invalidEmail')
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
      .values({ id: randomUUID(), email, locale })
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

    if (!updated[0]) throw new MemberError('member.gone')
  })
}

export async function setMemberStatus(
  actor: Actor,
  memberId: string,
  status: Exclude<MemberStatus, 'invited'>,
): Promise<void> {
  assertTenantAdmin(actor)

  if (memberId === actor.memberId && status === 'disabled') {
    throw new MemberError('member.cannotDisableSelf')
  }

  await withTenant(actor, async (tx) => {
    if (status === 'disabled') await assertAnotherAdminRemains(tx, memberId)

    const updated = await tx
      .update(member)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(member.id, memberId))
      .returning({ id: member.id })

    if (!updated[0]) throw new MemberError('member.gone')
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
    throw new MemberError('member.lastAdmin')
  }
}

export type RemoveMemberResult = {
  /** How much changed hands, so the confirmation can say it rather than imply it. */
  handedOver: MemberEstate
  /** Whether the account behind the membership went with it. */
  identityForgotten: boolean
}

/**
 * Removes somebody from this workspace for good, after their work has an owner.
 *
 * Disabling and removing are different answers to different questions. Somebody
 * on parental leave is disabled; somebody who has left and asked to be erased
 * is removed, and a `disabled` row still holds their name and address, which is
 * precisely what erasure is about.
 *
 * The successor is a parameter rather than a default for a reason that is not
 * technical: `workshop.owner_id` is RESTRICT, so the database already refuses
 * to let a member vanish out from under a team's agendas. Picking a successor
 * silently -- the acting admin, the oldest member -- would satisfy the
 * constraint and hand somebody else's work to whoever the code guessed. Making
 * it a choice keeps the decision with the person who knows the team.
 *
 * Folders are the same decision one level down: `folder.created_by` is what
 * folderRoleFromPath reads as ownership, and it carries no foreign key at all,
 * so nothing but this function keeps it pointing at somebody who exists.
 */
export async function removeMember(
  actor: Actor,
  memberId: string,
  successorId: string | null,
): Promise<RemoveMemberResult> {
  assertTenantAdmin(actor)

  // Before anything else, and separately from the last-admin rule below: an
  // admin removing themselves is not a governance question but a foot-gun,
  // and the message for it should say so rather than talk about admins.
  if (memberId === actor.memberId) {
    throw new MemberError('member.cannotRemoveSelf')
  }
  if (successorId === memberId) {
    throw new MemberError('member.successorIsLeaver')
  }

  const removed = await withTenant(actor, async (tx) => {
    const leaving = await tx
      .select({ identityId: member.identityId })
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1)
    if (!leaving[0]) throw new MemberError('member.gone')

    await assertAnotherAdminRemains(tx, memberId)

    const estate = (await estatesOf(tx)).get(memberId) ?? EMPTY_ESTATE
    if (ownsSomething(estate)) {
      if (!successorId) throw new MemberError('member.successorRequired')

      const successor = await tx
        .select({ status: member.status })
        .from(member)
        .where(eq(member.id, successorId))
        .limit(1)
      if (!successor[0]) throw new MemberError('member.successorGone')
      // A disabled member cannot sign in, so handing them a team's workshops
      // means nobody can open them until somebody notices why.
      if (successor[0].status === 'disabled') throw new MemberError('member.successorDisabled')

      await tx
        .update(workshop)
        .set({ ownerId: successorId, updatedAt: sql`now()` })
        .where(eq(workshop.ownerId, memberId))

      await tx
        .update(folder)
        .set({ createdBy: successorId, updatedAt: sql`now()` })
        .where(eq(folder.createdBy, memberId))
    }

    // Tokens, OAuth grants and every collaboration grant follow by cascade.
    // Nothing is left that could still act as this person.
    await tx.delete(member).where(eq(member.id, memberId))

    return { identityId: leaving[0].identityId, handedOver: estate }
  })

  /**
   * The account itself, but only if this was its last membership anywhere.
   *
   * The check cannot happen in the transaction above: `gw_app` cannot see
   * `identity` at all, and a count of memberships scoped by RLS would see only
   * this tenant and answer "none left" for somebody who works in two. The
   * SECURITY DEFINER function in drizzle/sql/902_forget_identity.sql asks the
   * question with BYPASSRLS and acts on it atomically.
   *
   * Outside the transaction it is therefore its own failure mode: if this
   * throws, the membership is already gone and the e-mail address is not. That
   * is the safe half to be left holding -- the person has no access either way,
   * and an orphaned identity can be removed again. The reverse order could
   * delete an account whose membership then failed to go.
   */
  const identityForgotten = await withTenant(actor, async (tx) => {
    const answer = await tx.execute(
      sql`select app.forget_identity_if_orphaned(${removed.identityId}::uuid) as forgotten`,
    )
    return Boolean((answer as unknown as { rows: { forgotten: boolean }[] }).rows?.[0]?.forgotten)
  })

  return { handedOver: removed.handedOver, identityForgotten }
}
