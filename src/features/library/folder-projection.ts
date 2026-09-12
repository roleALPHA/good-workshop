/**
 * Where a dragged folder would land: at which depth, under which parent,
 * behind which sibling.
 *
 * The sidebar reads as a list and is a tree, and nesting is expressed by
 * dragging sideways -- the same idea the agenda editor uses, and for the same
 * reason: a separate "make this a child of" control would be a second grammar
 * for one gesture. The difference is the depth. Clusters are clamped to one
 * level; folders nest as far as the schema allows.
 *
 * Pure, no DOM, and tested exhaustively before it was wired to a sensor.
 */

/** `folder_depth` caps `ancestor_ids` at seven, so seven is the deepest row. */
export const MAX_FOLDER_DEPTH = 7

export type FolderRow = {
  id: string
  parentId: string | null
  depth: number
}

export type FolderProjection = {
  depth: number
  parentId: string | null
  /** The sibling it lands behind, or null for first in its new parent. */
  afterId: string | null
  valid: boolean
}

const INVALID: FolderProjection = { depth: 0, parentId: null, afterId: null, valid: false }

/**
 * The rows a drag operates on.
 *
 * A folder travels with everything under it, so its own subtree leaves the list
 * for the duration. That makes "drop a folder inside itself" impossible by
 * construction rather than by a check somebody could later forget -- the domain
 * refuses it too, but it never gets asked.
 */
export function rowsForDrag<T extends FolderRow>(rows: T[], activeId: string): T[] {
  const subtree = descendantsOf(rows, activeId)
  return rows.filter((row) => !subtree.has(row.id))
}

export function getFolderProjection(
  rows: FolderRow[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
  indentPx: number,
): FolderProjection {
  const height = subtreeHeight(rows, activeId)
  const list = rowsForDrag(rows, activeId)

  const activeIndex = list.findIndex((row) => row.id === activeId)
  const overIndex = list.findIndex((row) => row.id === overId)
  if (activeIndex === -1 || overIndex === -1) return INVALID

  const active = list[activeIndex]!
  const reordered = arrayMove(list, activeIndex, overIndex)
  const previous = reordered[overIndex - 1]
  const next = reordered[overIndex + 1]

  const dragDepth = indentPx > 0 ? Math.round(dragOffsetX / indentPx) : 0
  const projected = active.depth + dragDepth

  // One below the row above at most -- you cannot skip a level into thin air --
  // and never so deep that the subtree coming along breaches the schema's cap.
  const maxDepth = Math.min(previous ? previous.depth + 1 : 0, MAX_FOLDER_DEPTH - height)
  // A parent's children are contiguous, so dropping shallower than whatever
  // follows would split somebody else's subtree in half.
  const minDepth = next ? next.depth : 0
  const depth = clamp(projected, Math.min(minDepth, maxDepth), maxDepth)

  const parentId = findParentId(reordered, overIndex, depth)

  return { depth, parentId, afterId: findAnchor(reordered, overIndex, depth), valid: true }
}

/** The nearest row above that sits one level up: the new parent. */
function findParentId(rows: FolderRow[], index: number, depth: number): string | null {
  if (depth === 0) return null
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth === depth - 1) return rows[i]!.id
  }
  return null
}

/**
 * The nearest row above that belongs to the same sibling list.
 *
 * Anything between at a greater depth is that sibling's own subtree and does
 * not count. Reaching something shallower first means there is no sibling above
 * at all -- the folder becomes the first child.
 */
function findAnchor(rows: FolderRow[], index: number, depth: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.depth === depth) return row.id
    if (row.depth < depth) return null
  }
  return null
}

/** Ids of everything below `id`, the folder itself excluded. */
function descendantsOf(rows: FolderRow[], id: string): Set<string> {
  const out = new Set<string>()
  for (const row of rows) {
    if (row.parentId === id || (row.parentId !== null && out.has(row.parentId))) out.add(row.id)
  }
  return out
}

/** How many levels the dragged folder brings with it. Zero for a leaf. */
function subtreeHeight(rows: FolderRow[], id: string): number {
  const active = rows.find((row) => row.id === id)
  if (!active) return 0
  const subtree = descendantsOf(rows, id)
  let deepest = active.depth
  for (const row of rows) {
    if (subtree.has(row.id) && row.depth > deepest) deepest = row.depth
  }
  return deepest - active.depth
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = items.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved!)
  return copy
}
