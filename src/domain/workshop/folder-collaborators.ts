import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import { folder, folderCollaborator, member } from '@/server/db/schema'
import { DomainError } from '@/domain/errors'
import {
  effectiveFolderRole,
  mayGrant,
  type FolderRole,
  type GrantableFolderRole,
} from './folder-access'

/**
 * Who may open everything in one folder.
 *
 * Named by MEMBER, never by e-mail, for the same reason workshop collaborators
 * are: an address is an identity and identities are global, so inviting by
 * address here would silently create cross-tenant access.
 *
 * There is no guest sibling to this. A share link names one workshop and gives
 * a session that cannot name an identity; a folder is a library concept, and
 * handing a link-holder a subtree is not a thing this product offers.
 */

export class FolderSharingError extends DomainError {}

/** Proof that folder access was resolved, with what it resolved to. */
export type FolderAccess = {
  folderId: string
  role: FolderRole
  actor: Actor
}

/**
 * Resolves what an actor holds on one folder, or throws.
 *
 * The path is read here rather than passed in, so no caller can decide for
 * itself what "the folder above" means.
 */
export async function assertFolderAccess(
  tx: Tx,
  actor: Actor,
  folderId: string,
): Promise<FolderAccess> {
  const rows = await tx
    .select({
      path: sql<{ id: string; createdBy: string | null; role: string | null }[]>`coalesce((
        select json_agg(
                 json_build_object('id', f.id, 'createdBy', f.created_by, 'role', fc.role)
                 order by u.ord
               )
        from unnest(array_append(${folder.ancestorIds}, ${folder.id})) with ordinality as u(fid, ord)
        join folder f on f.id = u.fid
        left join folder_collaborator fc
               on fc.folder_id = f.id and fc.member_id = ${actor.memberId ?? null}
      ), '[]'::json)`,
    })
    .from(folder)
    .where(eq(folder.id, folderId))
    .limit(1)

  const path = rows[0]?.path
  // RLS already filtered other tenants out, so "no row" is "no such folder".
  if (!path || path.length === 0) throw new FolderSharingError('folder.gone')

  const role = effectiveFolderRole(
    path.map((f) => ({ id: f.id, createdBy: f.createdBy })),
    new Map(
      path.flatMap((f) =>
        f.role === 'editor' || f.role === 'viewer' ? [[f.id, f.role] as const] : [],
      ),
    ),
    actor,
  )
  if (!role) throw new FolderSharingError('folder.gone')

  return { folderId, role, actor }
}

/** One person on a folder's access screen: what they hold here, and from above. */
export type FolderAccessEntry = {
  memberId: string
  /** A grant on this folder itself. */
  direct: GrantableFolderRole | null
  /**
   * What the nearest folder above that says anything about them gives --
   * having made it, or a grant on it. Null on a top folder, or when nothing
   * above names them.
   */
  inherited: { role: 'owner' | GrantableFolderRole; folderId: string; folderName: string } | null
}

/**
 * Everybody the folder tree gives something on this folder, directly or from
 * above.
 *
 * The screen used to read only the rows on the folder itself, so a colleague
 * given "Kunden" stood on "Kunden / Acme" as "no access" -- while they could
 * open everything in it. The grant always reached the subtree; now the list
 * says so.
 *
 * The walk is the one `effectiveFolderRole` makes: nearest folder first, and on
 * one folder the creator before a grant. The direct grant is kept apart rather
 * than folded in -- it is nearer and wins, and taking it away falls back to the
 * inherited one, which the screen has to be able to show.
 */
export async function listFolderAccess(tx: Tx, access: FolderAccess): Promise<FolderAccessEntry[]> {
  const target = await tx
    .select({ ancestorIds: folder.ancestorIds })
    .from(folder)
    .where(eq(folder.id, access.folderId))
    .limit(1)
  const ancestors = target[0]?.ancestorIds ?? []
  const path = [...ancestors, access.folderId]

  const [folders, grants] = await Promise.all([
    tx
      .select({ id: folder.id, name: folder.name, createdBy: folder.createdBy })
      .from(folder)
      .where(inArray(folder.id, path)),
    tx
      .select({
        folderId: folderCollaborator.folderId,
        memberId: folderCollaborator.memberId,
        role: folderCollaborator.role,
      })
      .from(folderCollaborator)
      .where(inArray(folderCollaborator.folderId, path)),
  ])

  const entries = new Map<string, FolderAccessEntry>()
  const entryOf = (memberId: string) => {
    let entry = entries.get(memberId)
    if (!entry) {
      entry = { memberId, direct: null, inherited: null }
      entries.set(memberId, entry)
    }
    return entry
  }
  const asRole = (role: string): GrantableFolderRole => (role === 'editor' ? 'editor' : 'viewer')

  for (const row of grants) {
    if (row.folderId === access.folderId) entryOf(row.memberId).direct = asRole(row.role)
  }

  const byId = new Map(folders.map((row) => [row.id, row]))
  for (const id of ancestors.slice().reverse()) {
    const above = byId.get(id)
    if (!above) continue
    const from = { folderId: above.id, folderName: above.name }
    if (above.createdBy) entryOf(above.createdBy).inherited ??= { role: 'owner', ...from }
    for (const row of grants) {
      if (row.folderId !== id) continue
      entryOf(row.memberId).inherited ??= { role: asRole(row.role), ...from }
    }
  }

  return [...entries.values()]
}

/**
 * Grants or changes one member's role on this folder.
 *
 * Never more than the granter holds -- `mayGrant` is the rule, and it is
 * checked here rather than in the action so that every caller, MCP included,
 * goes through it.
 */
export async function setFolderCollaborator(
  tx: Tx,
  access: FolderAccess,
  memberId: string,
  role: GrantableFolderRole,
): Promise<void> {
  if (!mayGrant(access.role, role)) throw new FolderSharingError('folder.grantTooWide')

  const exists = await tx
    .select({ id: member.id, status: member.status })
    .from(member)
    .where(eq(member.id, memberId))
    .limit(1)

  if (!exists[0]) throw new FolderSharingError('sharing.memberGone')
  if (exists[0].status === 'disabled') throw new FolderSharingError('sharing.memberDisabled')

  // The creator already holds more than a grant could give, and a row saying
  // otherwise would read as a demotion that never took effect -- it loses to
  // the creator check in `effectiveFolderRole`.
  const owner = await tx
    .select({ createdBy: folder.createdBy })
    .from(folder)
    .where(eq(folder.id, access.folderId))
    .limit(1)
  if (owner[0]?.createdBy === memberId) {
    throw new FolderSharingError('folder.creatorHasAccess')
  }

  await tx
    .insert(folderCollaborator)
    .values({ folderId: access.folderId, memberId, role, addedBy: access.actor.memberId })
    .onConflictDoUpdate({
      target: [folderCollaborator.folderId, folderCollaborator.memberId],
      set: { role },
    })
}

/**
 * Takes a grant back.
 *
 * The same rule as giving, which is the half that is easy to forget: without
 * it a viewer could revoke an editor, and "not more than you have" would hold
 * in one direction only. The role being removed is read first, because that is
 * what has to be within reach -- not the one being kept.
 */
export async function removeFolderCollaborator(
  tx: Tx,
  access: FolderAccess,
  memberId: string,
): Promise<void> {
  const rows = await tx
    .select({ role: folderCollaborator.role })
    .from(folderCollaborator)
    .where(
      and(
        eq(folderCollaborator.folderId, access.folderId),
        eq(folderCollaborator.memberId, memberId),
      ),
    )
    .limit(1)

  const existing = rows[0]?.role
  if (!existing) return

  const target: GrantableFolderRole = existing === 'editor' ? 'editor' : 'viewer'
  if (!mayGrant(access.role, target)) throw new FolderSharingError('folder.grantTooWide')

  await tx
    .delete(folderCollaborator)
    .where(
      and(
        eq(folderCollaborator.folderId, access.folderId),
        eq(folderCollaborator.memberId, memberId),
      ),
    )
}
