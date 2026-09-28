import type { ClusterMode } from '@/domain/agenda/types'
import type { Depth, FlatRow } from './flatten'

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
  /**
   * The document can hold three levels -- day, breakout, strand -- so the type
   * says three. What this function LETS a drag reach is a separate question,
   * and today the clamps below still answer it with two.
   */
  depth: Depth
  /** Clusters only. 'parallel' is a breakout; its children are strands. */
  mode: ClusterMode
  /** For a module inside a cluster: that cluster's id. */
  parentId: string | null
}

export type Projection = {
  depth: Depth
  parentId: string | null
  /** Index in the reordered list where the active row lands. */
  index: number
  /**
   * The sibling the row lands behind, or null for first.
   *
   * Carried alongside the index because they answer different questions. The
   * index is a position in the flat RENDER list, which is what the local
   * document renumbers against. Ordering keys are per sibling list, and the
   * two do not line up: rows between are a cluster's children, and index 0 is
   * "first row on screen" while a sort key needs "no predecessor". Deriving
   * one from the other at the call site got both wrong -- a block dragged to
   * the very top landed second.
   */
  afterId: string | null
  valid: boolean
}

const INVALID: Projection = {
  depth: 0,
  parentId: null,
  index: -1,
  afterId: null,
  valid: false,
}

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
  const inside = descendants(rows, activeId)
  return rows.filter((r) => isDraggable(r) && (r.id === activeId || !inside.has(r.id)))
}

/**
 * Everything under a row, however deep.
 *
 * One forward pass is enough because flattenDay always emits a parent before
 * its children. A direct-children filter was not enough once a breakout held
 * strands that held blocks: the BLOCKS stayed in the list, were projected
 * against the very thing being dragged, and a breakout could land inside its
 * own strand.
 */
export function descendants(rows: ProjectionRow[], rootId: string): Set<string> {
  const out = new Set([rootId])
  for (const row of rows) if (row.parentId !== null && out.has(row.parentId)) out.add(row.id)
  return out
}

function isDraggable(row: { kind: string }): boolean {
  return row.kind === 'cluster' || row.kind === 'module'
}

/** Drops gap rows and narrows FlatRow to what the projection actually reads. */
export function toProjectionRows(rows: FlatRow[]): ProjectionRow[] {
  const out: ProjectionRow[] = []
  for (const row of rows) {
    if (row.kind === 'gap') continue
    out.push({
      id: row.id,
      kind: row.kind,
      mode: row.kind === 'cluster' ? row.mode : 'sequential',
      depth: row.depth,
      parentId: row.parentId,
    })
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

  // What a horizontal offset MEANS depends on where you are.
  //
  // Outside a breakout, nesting is invisible -- it EXISTS only as an indent, so
  // the gesture has to create it: dragOffsetX / INDENT_PX.
  //
  // Inside a breakout it is visible: the column the pointer is over IS the
  // strand, and the collision detection has already answered that question
  // before we ask it. Deriving it a second time from the delta means having two
  // answers to one question, which can disagree -- and a drag that feels
  // haunted is exactly that. So X expresses nesting only where it cannot be seen.
  const inBreakout = insideBreakout(reordered, overIndex)
  const dragDepth = indentPx > 0 ? Math.round(dragOffsetX / indentPx) : 0
  const projected = inBreakout ? wantedDepth(active) : active.depth + dragDepth

  const maxDepth = maxDepthFor(active, previous, reordered, overIndex)
  const minDepth = minDepthFor(active, next)
  const depth = clamp(projected, minDepth, maxDepth)

  const parentId = depth === 0 ? null : findParentId(reordered, overIndex, depth)

  return normalise(
    {
      depth,
      parentId,
      index: overIndex,
      afterId: findAnchor(reordered, overIndex, depth, parentId),
      valid: true,
    },
    reordered,
    active,
  )
}

/** Where a row wants to sit inside a breakout, before the clamps have their say. */
function wantedDepth(active: ProjectionRow): Depth {
  if (active.kind !== 'cluster') return 2
  return active.mode === 'parallel' ? 0 : 1
}

/**
 * A block that would land straight in a breakout goes into its first strand.
 *
 * Clamped, not refused: this module clamps rather than rejects, and "dropped on
 * a breakout means into its first strand" is the same rule as the existing
 * "dropped on a cluster header means first child".
 */
function normalise(
  projection: Projection,
  rows: ProjectionRow[],
  active: ProjectionRow,
): Projection {
  if (active.kind === 'cluster' || projection.parentId === null) return projection
  const parent = rows.find((r) => r.id === projection.parentId)
  if (!parent || parent.mode !== 'parallel') return projection

  const firstStrand = rows.find((r) => r.parentId === parent.id && r.kind === 'cluster')
  if (!firstStrand) return { ...projection, depth: 0, parentId: null }
  return {
    ...projection,
    depth: 2,
    parentId: firstStrand.id,
    afterId: lastChildOf(rows, firstStrand.id),
  }
}

/** The last row already inside a container, so a drop lands after it. */
function lastChildOf(rows: ProjectionRow[], parentId: string): string | null {
  let last: string | null = null
  for (const row of rows) if (row.parentId === parentId) last = row.id
  return last
}

/**
 * The nearest row above that belongs to the same sibling list.
 *
 * At day level a cluster's child does not count, but the cluster it lives in
 * does -- dropping below the last row of a section means "after that section".
 * Inside a cluster, reaching the cluster row itself means "first child".
 */
function findAnchor(
  rows: ProjectionRow[],
  index: number,
  depth: Depth,
  parentId: string | null,
): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i]!
    if (depth === 0) {
      if (row.depth === 0) return row.id
      continue
    }
    // Reaching our own container means "first child", not "after it".
    if (row.id === parentId) return null
    if (row.depth === depth && row.parentId === parentId) return row.id
  }
  return null
}

/**
 * How deep a row may go, by what it is and what it lands under.
 *
 * A breakout is still hard-clamped to day level -- it is the one container
 * whose nesting the database cannot represent, and refusing it here means no
 * caller has to remember. A section may become a strand; a block may reach the
 * inside of one.
 */
function maxDepthFor(
  active: ProjectionRow,
  previous: ProjectionRow | undefined,
  rows: ProjectionRow[],
  overIndex: number,
): Depth {
  if (active.kind === 'cluster') {
    // A breakout never nests. A section may, but only into a breakout.
    if (active.mode === 'parallel') return 0
    return insideBreakout(rows, overIndex) ? 1 : 0
  }
  if (!previous) return 0
  // Below a container header: become its first child.
  if (previous.kind === 'cluster') return (previous.depth + 1) as Depth
  // Below one of a container's children: become its sibling.
  return previous.depth
}

/**
 * Whether the insertion point lies within a breakout.
 *
 * Read upwards from the row ABOVE the landing spot -- the row at overIndex is
 * the dragged one itself after the reorder, and asking it where it is would be
 * asking it to answer its own question. The first day-level row that is not a
 * breakout ends the search: past it we are back in the ordinary outline.
 */
function insideBreakout(rows: ProjectionRow[], overIndex: number): boolean {
  for (let i = overIndex - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.kind === 'cluster' && row.mode === 'parallel') return true
    if (row.depth === 0) return false
  }
  return false
}

/**
 * A container's children are contiguous by definition. Dropping a shallower row
 * between them would split it, so the floor rises to the depth of whatever
 * follows.
 */
function minDepthFor(active: ProjectionRow, next: ProjectionRow | undefined): Depth {
  if (active.kind === 'cluster') {
    // A strand may not be dropped between the blocks of another strand.
    return next && next.depth === 2 ? 1 : 0
  }
  if (!next) return 0
  return next.kind === 'module' ? next.depth : 0
}

/**
 * The container a row falls into at this depth.
 *
 * One level shallower than us means: that is our container. Same level means:
 * we are siblings and share one. That was two special cases for two depths;
 * with three depths it would have been four.
 */
function findParentId(rows: ProjectionRow[], index: number, depth: Depth): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.depth < depth) return row.kind === 'cluster' ? row.id : null
    if (row.depth === depth) return row.parentId
  }
  return null
}

function clamp(value: number, min: Depth, max: Depth): Depth {
  if (value <= min) return min
  if (value >= max) return max
  return value as Depth
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = items.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved!)
  return copy
}
