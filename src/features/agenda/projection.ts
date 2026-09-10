import type { FlatRow } from './flatten'

/**
 * Where a dragged row would land: at which depth, under which parent, at which
 * index.
 *
 * This is the highest-risk pure function in the app. The agenda looks like a
 * flat table but is a tree, and nesting is expressed by dragging horizontally.
 * If this function is subtly wrong, *every* drag feels haunted and people stop
 * trusting the editor -- so it is pure, it has no DOM access, and it is tested
 * exhaustively before any of it is wired to a sensor.
 */

export type ProjectionRow = {
  id: string
  kind: 'cluster' | 'module'
  depth: 0 | 1
  /** For a module inside a cluster: that cluster's id. */
  parentId: string | null
}

export type Projection = {
  depth: 0 | 1
  parentId: string | null
  /** Index in the reordered list where the active row lands. */
  index: number
  valid: boolean
}

const INVALID: Projection = { depth: 0, parentId: null, index: -1, valid: false }

/**
 * The list a drag operates on.
 *
 * Dragging a cluster moves its whole subtree, so its children are taken out for
 * the duration of the drag and the cluster travels as one unit. That also makes
 * dropping a cluster inside itself impossible by construction rather than by a
 * check that someone might later forget.
 *
 * Gap rows are derived display artefacts and never participate in a drag.
 */
export function rowsForDrag<T extends ProjectionRow>(rows: T[], activeId: string): T[] {
  const active = rows.find((r) => r.id === activeId)
  if (!active || active.kind !== 'cluster') return rows.filter(isDraggable)
  return rows.filter((r) => isDraggable(r) && r.parentId !== activeId)
}

function isDraggable(row: { kind: string }): boolean {
  return row.kind === 'cluster' || row.kind === 'module'
}

/** Drops gap rows and narrows FlatRow to what the projection actually reads. */
export function toProjectionRows(rows: FlatRow[]): ProjectionRow[] {
  const out: ProjectionRow[] = []
  for (const row of rows) {
    if (row.kind === 'gap') continue
    out.push({ id: row.id, kind: row.kind, depth: row.depth, parentId: row.parentId })
  }
  return out
}

export function getProjection(
  rows: ProjectionRow[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
  indentPx: number,
): Projection {
  const activeIndex = rows.findIndex((r) => r.id === activeId)
  const overIndex = rows.findIndex((r) => r.id === overId)
  if (activeIndex === -1 || overIndex === -1) return INVALID

  const active = rows[activeIndex]!
  const reordered = arrayMove(rows, activeIndex, overIndex)
  const previous = reordered[overIndex - 1]
  const next = reordered[overIndex + 1]

  const dragDepth = indentPx > 0 ? Math.round(dragOffsetX / indentPx) : 0
  const projected = active.depth + dragDepth

  const maxDepth = maxDepthFor(active, previous)
  const minDepth = minDepthFor(active, next)
  const depth = clamp(projected, minDepth, maxDepth)

  return {
    depth,
    parentId: depth === 0 ? null : findParentId(reordered, overIndex),
    index: overIndex,
    valid: true,
  }
}

/**
 * Clusters are hard-clamped to the day level. Allowing them to nest would mean
 * a recursive tree, a recursive schedule walk and a recursive export -- and the
 * product does not ask for it. Enforcing it here removes a whole class of bugs.
 */
function maxDepthFor(active: ProjectionRow, previous: ProjectionRow | undefined): 0 | 1 {
  if (active.kind === 'cluster') return 0
  if (!previous) return 0
  // Below a cluster header: become its first child.
  if (previous.kind === 'cluster') return 1
  // Below one of a cluster's children: become its sibling.
  return previous.depth
}

/**
 * A cluster's children are contiguous by definition. Dropping a day-level row
 * between them would split the cluster, so the floor rises to the depth of
 * whatever follows.
 */
function minDepthFor(active: ProjectionRow, next: ProjectionRow | undefined): 0 | 1 {
  if (active.kind === 'cluster') return 0
  if (!next) return 0
  return next.kind === 'module' ? next.depth : 0
}

/** The nearest cluster header above the insertion point. */
function findParentId(rows: ProjectionRow[], index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.kind === 'cluster') return row.id
    if (row.depth === 1 && row.parentId !== null) return row.parentId
  }
  return null
}

function clamp(value: number, min: 0 | 1, max: 0 | 1): 0 | 1 {
  if (value <= min) return min
  if (value >= max) return max
  return value as 0 | 1
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = items.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved!)
  return copy
}
