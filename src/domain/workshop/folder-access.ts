import { sql, type SQL } from 'drizzle-orm'
import type { Actor } from '@/server/db'

/**
 * Who may do what with a folder, and with everything under it.
 *
 * A folder grant reaches the whole subtree. That is the point of it -- "the
 * Acme team works in Kunden/Acme" is one sentence, not one grant per workshop
 * -- and it is also what makes it dangerous: the grant reaches workshops the
 * granter does not own, and a workshop moved INTO a shared folder becomes
 * shared by that move alone.
 *
 * Two rules keep that bounded, and both live in this file:
 *
 *  - **The nearest folder decides.** Walking from the workshop upwards, the
 *    first folder that says anything about this member is the answer. So a
 *    subtree shared as editor can still hold one folder shared as viewer.
 *  - **Nobody hands on more than they hold.** A folder editor may make editors
 *    and viewers; a folder viewer may only make viewers. Delegation without
 *    escalation.
 */

/** The two roles a grant can carry. Owner and admin are not granted, they are. */
export type GrantableFolderRole = 'editor' | 'viewer'

/** What somebody actually holds on a folder. */
export type FolderRole = 'owner' | 'admin' | GrantableFolderRole

/** One step of the path from the root down to the folder in question. */
export type FolderStep = {
  id: string
  /** Null for a folder whose creator has since been removed from the tenant. */
  createdBy: string | null
}

/**
 * The role a member holds on the last folder of `path`.
 *
 * `path` runs root first, the folder itself last -- the shape
 * `array_append(ancestor_ids, id)` produces. `grants` holds only this member's
 * rows, keyed by folder id.
 *
 * The walk is from the deep end on purpose: the nearest folder that says
 * anything wins, and "says anything" means an explicit grant OR having created
 * it. Both on the same folder means the creator wins, because a grant cannot
 * demote somebody out of their own folder.
 *
 * A tenant admin is the floor rather than the ceiling: an explicit grant that
 * names them is respected first, the same way `effectiveRole` lets a workshop
 * grant sit in front of the admin override.
 */
export function effectiveFolderRole(
  path: readonly FolderStep[],
  grants: ReadonlyMap<string, GrantableFolderRole>,
  actor: Actor,
): FolderRole | null {
  // A guest reached exactly one workshop through a link. Folders are a library
  // concept and a guest has no library -- falling through here is how a share
  // link would become a key to a whole subtree.
  if (actor.share) return null

  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i]!
    if (actor.memberId && step.createdBy === actor.memberId) return 'owner'
    const granted = grants.get(step.id)
    if (granted) return granted
  }

  if (actor.tenantRole === 'admin') return 'admin'
  return null
}

/**
 * What this role may hand on -- never more than it holds.
 *
 * Equal is not more: an editor may make another editor. That is what makes a
 * shared folder workable without an admin in the loop for every addition.
 */
export function grantableRoles(own: FolderRole | null): readonly GrantableFolderRole[] {
  switch (own) {
    case 'owner':
    case 'admin':
    case 'editor':
      return ['editor', 'viewer']
    case 'viewer':
      return ['viewer']
    default:
      return []
  }
}

/**
 * Whether `own` may create, change or remove a grant of `target`.
 *
 * Removal takes the same rule as giving, which is the half that is easy to
 * forget: without it a viewer could revoke an editor, and "not more than you
 * have" would hold for handing out and not for taking away.
 */
export function mayGrant(own: FolderRole | null, target: GrantableFolderRole): boolean {
  return grantableRoles(own).includes(target)
}

/**
 * What a folder role means for a workshop that sits inside it.
 *
 * Collaboration, never ownership. Somebody who made a folder, or was given one,
 * has no business deleting or transferring a colleague's workshop that happens
 * to be filed there -- those are `workshop.delete` and `workshop.transfer`, and
 * they stay with the owner. So the strongest a folder can confer is `editor`.
 *
 * `admin` deliberately returns null: the tenant-admin override lives in
 * `effectiveRole`, it comes after this, and it writes an audit event. Answering
 * "editor" here would route an admin around that.
 */
export function inheritedWorkshopRole(folderRole: FolderRole | null): GrantableFolderRole | null {
  switch (folderRole) {
    case 'owner':
    case 'editor':
      return 'editor'
    case 'viewer':
      return 'viewer'
    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// The same rule, reached from SQL
// ═══════════════════════════════════════════════════════════════════════════

/** One row of the aggregate below. `role` is null where only creation matched. */
export type FolderPathRow = { id: string; createdBy: string | null; role: string | null }

/**
 * The folder path of one workshop, root first, with this member's grants.
 *
 * Shared by `assertWorkshopAccess` and the library listing on purpose. Those
 * two have to agree -- a row that shows up in the list and then 404s when
 * opened is worse than either half alone -- and the cheapest way to make two
 * queries agree is for there to be one query.
 *
 * Bounded: `folder_depth` caps a path at eight, and the join is on
 * (tenant_id, member_id), which is indexed.
 */
export function folderPathSql(folderIdColumn: SQL | unknown, memberId: string | null): SQL {
  return sql`coalesce((
    select json_agg(
             json_build_object('id', f.id, 'createdBy', f.created_by, 'role', fc.role)
             order by u.ord
           )
    from folder pf
    cross join lateral unnest(array_append(pf.ancestor_ids, pf.id)) with ordinality as u(fid, ord)
    join folder f on f.id = u.fid
    left join folder_collaborator fc
           on fc.folder_id = f.id and fc.member_id = ${memberId}
    where pf.id = ${folderIdColumn}
  ), '[]'::json)`
}

/** Whether the folder tree gives this member anything on a workshop. */
export function folderReachSql(folderIdColumn: SQL | unknown, memberId: string | null): SQL {
  return sql`exists (
    select 1
    from folder pf
    join folder f on f.id = any(array_append(pf.ancestor_ids, pf.id))
    left join folder_collaborator fc
           on fc.folder_id = f.id and fc.member_id = ${memberId}
    where pf.id = ${folderIdColumn}
      and (fc.role is not null or f.created_by = ${memberId})
  )`
}

/** `folderPathSql` rows through the rule, in one call. */
export function folderRoleFromPath(
  path: readonly FolderPathRow[],
  actor: Actor,
): FolderRole | null {
  return effectiveFolderRole(
    path.map((f) => ({ id: f.id, createdBy: f.createdBy })),
    new Map(
      path.flatMap((f) =>
        f.role === 'editor' || f.role === 'viewer' ? [[f.id, f.role] as const] : [],
      ),
    ),
    actor,
  )
}
