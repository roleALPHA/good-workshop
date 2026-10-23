import {
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import type { ProjectionRow } from './projection'

/**
 * Which rows make room while a row is dragged, and in which direction.
 *
 * dnd-kit's list strategies assume what they are named for: one list, every
 * item a sibling of the next. The agenda is one list only for the drag. On
 * screen a breakout is a box, its strands stand side by side inside it, and
 * their blocks sit inside those -- three sortable items nested in each other.
 * A vertical strategy over all of them shifted the breakout, then the strand
 * inside it once more, then the block inside that a third time, and the strands
 * climbed out of their own box as soon as a card passed above a breakout.
 *
 * So the flat list is cut into the lists that actually lie in a line:
 *
 * - the outline: every row outside a breakout, the breakout itself as one box;
 * - the blocks of one strand, top to bottom;
 * - the strands of one breakout, left to right.
 *
 * A drag within one of them is that list's ordinary strategy. A drag out of a
 * breakout into the outline opens a slot there. Anything else -- a day-level
 * block hovering over a strand, a block crossing to the neighbouring strand --
 * moves nothing: the live region and the drop-target outline say where it
 * lands, and a shift would only show a place the drop does not take.
 *
 * Purely visual. Where a drop lands is getProjection's answer alone.
 */
export function agendaSortingStrategy(rows: ProjectionRow[]): SortingStrategy {
  // Which breakout a row sits in, however deep. Parents come before their
  // children in the flat list, so one forward pass sees every chain whole.
  const breakoutOf = new Map<string, string>()
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const row of rows) {
    if (row.parentId === null) continue
    const parent = byId.get(row.parentId)
    if (parent?.mode === 'parallel') breakoutOf.set(row.id, parent.id)
    else if (breakoutOf.has(row.parentId)) breakoutOf.set(row.id, breakoutOf.get(row.parentId)!)
  }

  const isStrand = (row: ProjectionRow) => row.kind === 'cluster' && breakoutOf.has(row.id)
  const indicesWhere = (keep: (row: ProjectionRow) => boolean) =>
    rows.flatMap((row, index) => (keep(row) ? [index] : []))

  const outline = indicesWhere((row) => !breakoutOf.has(row.id))

  return ({ activeIndex, overIndex, index, rects, activeNodeRect }) => {
    const active = rows[activeIndex]
    let over = rows[overIndex]
    if (!active || !over) return null

    const shift = (list: number[], strategy: SortingStrategy, overAt = overIndex) =>
      settled(
        list.includes(index)
          ? strategy({
              activeNodeRect,
              activeIndex: list.indexOf(activeIndex),
              overIndex: list.indexOf(overAt),
              index: list.indexOf(index),
              rects: list.map((i) => rects[i]!),
            })
          : null,
      )

    const activeInside = breakoutOf.has(active.id)
    const overInside = breakoutOf.has(over.id)

    if (!activeInside && !overInside) return shift(outline, verticalListSortingStrategy)

    if (activeInside && !overInside) {
      // Out of a breakout into the outline. The row leaves a box that keeps its
      // size, so there is nothing to close -- only a slot to open. dnd-kit puts
      // the row behind an `over` further down and in front of one further up.
      if (!outline.includes(index)) return null
      const opens = activeIndex < overIndex ? index > overIndex : index >= overIndex
      return opens ? { x: 0, y: activeNodeRect?.height ?? 0, scaleX: 1, scaleY: 1 } : null
    }

    if (isStrand(active)) {
      // A strand is dragged by its head, but the pointer spends most of its
      // time over the blocks of the neighbouring strand. That block stands for
      // its strand.
      if (!isStrand(over)) over = byId.get(over.parentId ?? '') ?? over
      if (!isStrand(over) || over.parentId !== active.parentId) return null
      const strands = indicesWhere((row) => isStrand(row) && row.parentId === active.parentId)
      return shift(strands, horizontalListSortingStrategy, rows.indexOf(over))
    }

    if (activeInside && active.parentId === over.parentId) {
      return shift(
        indicesWhere((row) => row.parentId === active.parentId),
        verticalListSortingStrategy,
      )
    }

    return null
  }
}

/** A shift of nothing is no shift: the row keeps no transform at all. */
function settled(transform: ReturnType<SortingStrategy>): ReturnType<SortingStrategy> {
  if (!transform || (transform.x === 0 && transform.y === 0)) return null
  return transform
}
