import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import { workshop, workshopCollaborator } from '@/server/db/schema'
import { DomainError } from '@/domain/errors'

/**
 * Per-workshop authorisation, in the application layer.
 *
 * RLS guards the TENANT boundary and nothing else, deliberately:
 *
 *  - A policy on `module` would have to walk module → cluster? → day →
 *    workshop → collaborator for every row, on the hottest read path there is.
 *  - RLS cannot produce a 403. A row you may not edit simply vanishes, so a
 *    colleague who shared a workshop with you as viewer sees "not found".
 *  - Admin override, share links and PAT scope intersection turn into policy
 *    special cases; here they are fifteen readable lines.
 *
 * The "defense in depth" counter-argument is answered by keeping the tenant
 * boundary in RLS. A bug there leaks a competitor's data; a bug here leaks a
 * colleague's agenda inside the same organisation -- bad, but bounded and
 * detectable.
 */

export type WorkshopRole = 'owner' | 'editor' | 'viewer' | 'admin'

export type Capability =
  | 'workshop.read'
  | 'workshop.export'
  | 'workshop.content.write'
  | 'workshop.update'
  | 'workshop.share'
  | 'workshop.transfer'
  | 'workshop.delete'

const CAPABILITIES: Record<WorkshopRole, readonly Capability[]> = {
  viewer: ['workshop.read', 'workshop.export'],
  editor: ['workshop.read', 'workshop.export', 'workshop.content.write', 'workshop.update'],
  owner: [
    'workshop.read',
    'workshop.export',
    'workshop.content.write',
    'workshop.update',
    'workshop.share',
    'workshop.transfer',
    'workshop.delete',
  ],
  admin: [
    'workshop.read',
    'workshop.export',
    'workshop.content.write',
    'workshop.update',
    'workshop.share',
    'workshop.transfer',
    'workshop.delete',
  ],
}

declare const brand: unique symbol

/**
 * Proof that access was checked. Constructible only by assertWorkshopAccess.
 *
 * Every repository mutation takes one of these, so forgetting the check is a
 * compile error rather than a security incident. That is the entire point --
 * a convention that relies on remembering will eventually not be remembered.
 */
export type WorkshopAccess = {
  readonly [brand]: true
  workshopId: string
  contentVersion: bigint
  role: WorkshopRole
  actor: Actor
  can(capability: Capability): boolean
}

export class NotFoundError extends DomainError {
  constructor() {
    super('workshop.notFound')
  }
}

export class ForbiddenError extends DomainError {
  constructor(readonly capability: Capability) {
    super('workshop.forbidden', { capability })
  }
}

/**
 * A block type that is not in this tenant.
 *
 * Two shapes on purpose: from the editor the id came from a picker and the
 * person needs no list, while over MCP the model chose the key itself and the
 * alternatives are the difference between a fixed next call and another guess.
 */
export class UnknownModuleTypeError extends DomainError {
  constructor(key?: string, available?: string[]) {
    if (key === undefined || available === undefined) {
      super('workshop.unknownModuleType')
      return
    }
    super('workshop.unknownModuleTypeOptions', { key, available: available.join(', ') })
  }
}

export class VersionConflictError extends DomainError {
  constructor(
    public readonly expected: bigint,
    public readonly actual: bigint,
  ) {
    // Stringified here rather than at the boundary: a bigint does not survive
    // JSON, and an ActionResult crosses the RSC boundary on its way to the
    // browser.
    super('workshop.versionConflict', {
      expected: expected.toString(),
      actual: actual.toString(),
    })
  }
}

/**
 * Resolves and asserts access in one query.
 *
 * Throws NotFoundError when there is no access at all and ForbiddenError when
 * there is access but not this capability -- the distinction users need, and
 * the one RLS cannot make.
 *
 * `forUpdate` takes the row lock that serialises all structural edits to this
 * workshop. Reads never take it.
 */
export async function assertWorkshopAccess(
  tx: Tx,
  actor: Actor,
  workshopId: string,
  capability: Capability,
  options: { forUpdate?: boolean; includeTrashed?: boolean } = {},
): Promise<WorkshopAccess> {
  const wantsWrite = capability !== 'workshop.read' && capability !== 'workshop.export'
  const lock = options.forUpdate ?? wantsWrite

  const rows = await tx
    .select({
      ownerId: workshop.ownerId,
      contentVersion: workshop.contentVersion,
      collaboratorRole: workshopCollaborator.role,
    })
    .from(workshop)
    .leftJoin(
      workshopCollaborator,
      and(
        eq(workshopCollaborator.workshopId, workshop.id),
        eq(workshopCollaborator.memberId, actor.memberId),
      ),
    )
    // A workshop in the bin is invisible here by default, which is what makes
    // the library and every editor route agree that it is gone. The two
    // operations that act ON the bin -- restore and purge -- are the exception,
    // and they say so: without this they could never find their own subject.
    .where(
      and(
        eq(workshop.id, workshopId),
        options.includeTrashed ? undefined : isNull(workshop.deletedAt),
      ),
    )
    .limit(1)
    .for(lock ? 'update' : 'no key update', { of: workshop })

  const row = rows[0]
  // RLS already filtered other tenants out, so "no row" here means exactly
  // "not in this tenant, or deleted".
  if (!row) throw new NotFoundError()

  const role = effectiveRole(row.ownerId, row.collaboratorRole, actor)
  if (!role) throw new NotFoundError()

  const allowed = CAPABILITIES[role]
  if (!allowed.includes(capability)) throw new ForbiddenError(capability)

  return {
    workshopId,
    contentVersion: row.contentVersion,
    role,
    actor,
    can: (c) => allowed.includes(c),
  } as WorkshopAccess
}

function effectiveRole(
  ownerId: string,
  collaboratorRole: string | null,
  actor: Actor,
): WorkshopRole | null {
  if (ownerId === actor.memberId) return 'owner'
  if (collaboratorRole === 'editor' || collaboratorRole === 'viewer') return collaboratorRole
  // Defaults to on: self-hosted teams expect an admin to be able to help. Every
  // such access writes an audit event, and the transparency is what makes the
  // default acceptable rather than creepy.
  if (actor.tenantRole === 'admin') return 'admin'
  return null
}

/**
 * Bumps content_version and returns the new value.
 *
 * The concurrency unit is the workshop row, not the list: workshops are small
 * and edits are human-paced, so one FOR UPDATE gives serialisable structural
 * edits without SERIALIZABLE isolation and its retry loop -- and hands us the
 * version counter that powers ETags, editor conflict detection and MCP
 * compare-and-swap for free.
 */
export async function bumpContentVersion(
  tx: Tx,
  access: WorkshopAccess,
  expectedVersion?: bigint,
): Promise<bigint> {
  if (expectedVersion !== undefined && expectedVersion !== access.contentVersion) {
    throw new VersionConflictError(expectedVersion, access.contentVersion)
  }

  const updated = await tx
    .update(workshop)
    .set({
      contentVersion: sql`${workshop.contentVersion} + 1`,
      updatedAt: sql`now()`,
      updatedBy: access.actor.memberId,
    })
    .where(eq(workshop.id, access.workshopId))
    .returning({ contentVersion: workshop.contentVersion })

  return updated[0]!.contentVersion
}
