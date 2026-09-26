import { asc, inArray, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import { memberIdOf, withAuth, withTenant } from '@/server/db'
import { folder, identity, member, workshop } from '@/server/db/schema'
import { DomainError } from '@/domain/errors'
import type { AssignablePerson } from '@/domain/agenda/responsible'
import { fullName } from './person-name'

/**
 * Who belongs to this tenant.
 *
 * Every read here is two queries on purpose. Member rows are tenant data and
 * live behind RLS; e-mail addresses live in the global identity table, which
 * `gw_app` cannot read at all -- reaching them means stepping into `gw_auth`
 * for exactly that one query. A join across the boundary is impossible by
 * construction, which is the point of the boundary.
 *
 * Changing a membership -- inviting, renaming, role, status, removing -- is in
 * ./membership.ts. It reads through the same helpers, so the two cannot disagree
 * about who is there.
 */

export type TenantRole = 'member' | 'admin'
export type MemberStatus = 'invited' | 'active' | 'disabled'

export type MemberRow = {
  id: string
  email: string
  firstName: string
  lastName: string
  /** First and last name joined; '' for somebody who has no name yet. */
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
 * an export, onto paper, to a guest. So a member without a name yet is
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

/**
 * What one member owns.
 *
 * A member who owns nothing has no row in `estatesOf` at all, and "nothing" is a
 * perfectly good answer -- so the absence is turned into zeroes here rather than
 * at each of the two call sites, where forgetting it would read as "not allowed
 * to know" instead.
 */
export async function estateOf(tx: Tx, memberId: string): Promise<MemberEstate> {
  return (await estatesOf(tx)).get(memberId) ?? EMPTY_ESTATE
}

/** What a member owns, for their own account page. */
export async function ownEstate(actor: Actor): Promise<MemberEstate> {
  const memberId = memberIdOf(actor)
  return withTenant(actor, (tx) => estateOf(tx, memberId))
}

async function readMembers(actor: Actor): Promise<MemberRow[]> {
  const rows = await withTenant(actor, (tx) =>
    tx
      .select({
        id: member.id,
        identityId: member.identityId,
        role: member.role,
        status: member.status,
        firstName: member.firstName,
        lastName: member.lastName,
      })
      .from(member)
      .orderBy(asc(member.createdAt)),
  )
  if (rows.length === 0) return []

  const identities = await withAuth((tx) =>
    tx
      .select({ id: identity.id, email: identity.email })
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
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: fullName(row),
      role: row.role === 'admin' ? 'admin' : 'member',
      status: row.status as MemberStatus,
      isSelf: row.id === actor.memberId,
      owns: EMPTY_ESTATE,
    }
  })
}
