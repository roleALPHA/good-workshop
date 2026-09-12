/**
 * What a drop in the library means.
 *
 * Kept away from the components because the interesting part is not the
 * gesture, it is the two cases that must produce no request at all: dropping
 * something back where it already sits, and letting go over nothing. Both are
 * ordinary -- people change their mind mid-drag -- and both would otherwise
 * write a row and refresh a page for no reason.
 */

/** The droppable id of the "Alle Workshops" row: the top level. */
export const ROOT_DROP_ID = 'library-root'

export type DragKind = 'workshop' | 'folder'

export type ActiveDrag =
  | { kind: 'workshop'; id: string; title: string; folderId: string | null }
  | { kind: 'folder'; id: string; name: string }

/** The folder a droppable id stands for. Null is the top level. */
export const folderOf = (overId: string | null): string | null =>
  overId === null || overId === ROOT_DROP_ID ? null : overId

/**
 * The move a workshop drop asks for, or null when it asks for nothing.
 */
export function resolveWorkshopDrop(
  active: { id: string; folderId: string | null },
  overId: string | null,
): { workshopId: string; folderId: string | null } | null {
  if (overId === null) return null
  const folderId = folderOf(overId)
  if (folderId === active.folderId) return null
  return { workshopId: active.id, folderId }
}

/**
 * The move a folder drop asks for, or null when it asks for nothing.
 *
 * The projection has already decided where the folder lands; this only strips
 * out the drop that would rewrite a row into the position it is already in.
 */
export function resolveFolderDrop(
  active: { id: string; parentId: string | null },
  current: { afterId: string | null },
  projected: { parentId: string | null; afterId: string | null; valid: boolean },
): { id: string; parentId: string | null; afterId: string | null } | null {
  if (!projected.valid) return null
  if (projected.parentId === active.parentId && projected.afterId === current.afterId) return null
  return { id: active.id, parentId: projected.parentId, afterId: projected.afterId }
}
