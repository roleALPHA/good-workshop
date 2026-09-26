import { randomUUID } from 'node:crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import type { Locale } from '@/i18n/config'
import { memberIdOf, withAuth, withTenant } from '@/server/db'
import { folder, identity, member, workshop } from '@/server/db/schema'
import { normalisePersonName, type PersonName } from './person-name'
import {
  assertTenantAdmin,
  estateOf,
  MemberError,
  ownsSomething,
  type MemberEstate,
  type MemberStatus,
  type TenantRole,
} from './members'

/**
 * Joining, changing and leaving a tenant.
 *
 * Three rules run through all of it. Inviting is idempotent, because a second
 * invitation to an address that is already a member must not create a second
 * membership. A tenant never loses its last admin -- checked in the same
 * transaction as the change, or two concurrent demotions would each see the
 * other still there. And nothing takes somebody's workshops with them: removing
 * a member who owns content is refused and says what they own, so a person is
 * deleted on purpose rather than as a side effect.
 *
 * Reading the roster is in ./members.ts.
 */

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
  /** Asked for on invitation, so that nobody appears under their address. */
  name: PersonName,
): Promise<InviteResult> {
  assertTenantAdmin(actor)
  const { firstName, lastName } = normalisePersonName(name)

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
        firstName,
        lastName,
        invitedBy: actor.memberId,
      })
      .returning({ id: member.id })
      .catch((error: unknown) => {
        // Only where one person may belong to one workspace (the cloud edition's
        // member_one_tenant_per_identity): the address is taken elsewhere.
        if (violates(error, 'member_one_tenant_per_identity')) {
          throw new MemberError('member.cannotInvite')
        }
        throw error
      })

    return { memberId: created[0]!.id, email, alreadyMember: false }
  })
}

/**
 * An admin correcting a colleague's name.
 *
 * Admin-only because a name is how everybody else recognises a person in the
 * agenda; letting any member rename a colleague would let them put words in
 * somebody else's mouth.
 */
export async function setMemberName(
  actor: Actor,
  memberId: string,
  name: PersonName,
): Promise<void> {
  assertTenantAdmin(actor)
  const { firstName, lastName } = normalisePersonName(name)

  await withTenant(actor, async (tx) => {
    const updated = await tx
      .update(member)
      .set({ firstName, lastName, updatedAt: sql`now()` })
      .where(eq(member.id, memberId))
      .returning({ id: member.id })

    if (!updated[0]) throw new MemberError('member.gone')
  })
}

/**
 * Anybody changing their own name. The member id comes from the session, never
 * from the request, so there is nothing to point at somebody else.
 */
export async function setOwnName(actor: Actor, name: PersonName): Promise<void> {
  const memberId = memberIdOf(actor)
  const { firstName, lastName } = normalisePersonName(name)

  await withTenant(actor, async (tx) => {
    const updated = await tx
      .update(member)
      .set({ firstName, lastName, updatedAt: sql`now()` })
      .where(eq(member.id, memberId))
      .returning({ id: member.id })

    if (!updated[0]) throw new MemberError('member.gone')
  })
}

function violates(error: unknown, constraint: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const pgError = current as Error & { code?: string; constraint?: string }
    if (pgError.code === '23505' && pgError.constraint === constraint) return true
  }
  return false
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

  return dropMembership(actor, memberId, successorId)
}

/**
 * Somebody deleting their own account in this workspace.
 *
 * The same consequences as an admin removing them -- work handed to a
 * successor, tokens and grants gone, the account forgotten once no workspace
 * holds it any more -- and the same last-admin rule, because a workspace nobody
 * can administer is as stuck when its admin leaves as when they are removed.
 * What is not the same is who may ask: only the person themselves, identified
 * by the session, never by a parameter.
 */
export async function deleteOwnAccount(
  actor: Actor,
  successorId: string | null,
): Promise<RemoveMemberResult> {
  const memberId = memberIdOf(actor)
  if (successorId === memberId) throw new MemberError('member.successorIsLeaver')
  return dropMembership(actor, memberId, successorId)
}

async function dropMembership(
  actor: Actor,
  memberId: string,
  successorId: string | null,
): Promise<RemoveMemberResult> {
  const removed = await withTenant(actor, async (tx) => {
    const leaving = await tx
      .select({ identityId: member.identityId })
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1)
    if (!leaving[0]) throw new MemberError('member.gone')

    await assertAnotherAdminRemains(tx, memberId)

    const estate = await estateOf(tx, memberId)
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
