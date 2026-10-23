import {
  closestCorners,
  pointerWithin,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
} from '@dnd-kit/core'
import { treeKeyboardCoordinateGetter } from '@/features/agenda/keyboard'

/**
 * How dnd-kit is set up for an agenda, and why not by its defaults.
 *
 * Every value here is a decision the library got reasonably wrong for this
 * particular table: rows that vary wildly in height, a nesting gesture on the
 * horizontal axis, and a live region we want to fill ourselves. Module scope
 * rather than inside the component on purpose -- dnd-kit compares these objects
 * by identity, and a fresh one each render re-registers the sensors mid-drag.
 */

export const INDENT_PX = 28

/**
 * Created once, at module level, and this is load-bearing.
 *
 * `useSensor` memoises on the identity of its options object. Building the
 * coordinate getter inside the component hands it a new function on every
 * render, so the sensor is torn down and re-instantiated mid-drag -- and it
 * takes its document key listener with it.
 */
export const KEYBOARD_COORDINATES = treeKeyboardCoordinateGetter(INDENT_PX)

/** Same reason: every one of these objects must keep its identity across renders. */
// A few pixels of slop so a click on a row stays a click, not a one-pixel drag.
export const MOUSE_OPTIONS = { activationConstraint: { distance: 6 } }
// Long-press, so the page still scrolls under a finger.
export const TOUCH_OPTIONS = { activationConstraint: { delay: 200, tolerance: 8 } }
export const KEYBOARD_OPTIONS = { coordinateGetter: KEYBOARD_COORDINATES }

/** dnd-kit keeps its own live region; we keep ours quiet by giving it nothing. */
export const SILENT_ANNOUNCEMENTS: Announcements = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
}

/**
 * Rows vary wildly in height -- a one-line break next to a block with a nested
 * bullet list. `closestCenter` mis-targets the tall ones badly, so pointer
 * containment wins where it applies and corners are the fallback.
 *
 * A keyboard drag has no pointer, and for it corners are wrong too: comparing
 * all four means a short row wins over the tall row the user actually stepped
 * onto, because half its corners are nearer by accident of height. What a key
 * press means is "the row that starts here", so the keyboard path ranks by top
 * edge alone -- which treeKeyboardCoordinateGetter aims at exactly, making the
 * intended row a zero-distance answer rather than the winner of a tie-break.
 */
export const agendaCollisionDetection: CollisionDetection = (args) => {
  const { collisionRect, droppableRects, droppableContainers, pointerCoordinates } = args

  if (pointerCoordinates) {
    const within = pointerWithin(args)
    if (within.length > 0) return within
    return closestCorners(args)
  }

  return droppableContainers
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      return rect
        ? [
            {
              id: container.id,
              data: {
                droppableContainer: container,
                // Top edge first, left edge as the tie-break. Without the
                // second term three blocks in three strands are the same place
                // to the keyboard: they share a top edge, the distance is zero
                // three times over, and whoever comes first in the DOM wins --
                // so ArrowDown in strand 3 lands in strand 1.
                value:
                  Math.abs(rect.top - collisionRect.top) * 1000 +
                  Math.abs(rect.left - collisionRect.left),
              },
            },
          ]
        : []
    })
    .sort((a, b) => a.data.value - b.data.value)
}

/**
 * Where a row stands in the layout, whatever the drag is doing to it.
 *
 * dnd-kit's own measure undoes a row's transform, but only the row's own. A
 * strand sits inside its breakout, and a breakout makes room for a card by
 * moving as one box -- so the strand was measured where its breakout had
 * carried it. The pointer then met a different row than the one under it in
 * the layout, the rows made room for THAT one, and the next measurement
 * disagreed again.
 *
 * Every transform up to the agenda's region is a translation from a sortable
 * row, so subtracting them is exact.
 */
export function layoutRect(element: HTMLElement): ClientRect {
  const rect = element.getBoundingClientRect()
  let x = 0
  let y = 0
  for (
    let node: HTMLElement | null = element;
    node && !node.classList.contains('gw-agenda');
    node = node.parentElement
  ) {
    const [dx, dy] = translationOf(getComputedStyle(node).transform)
    x += dx
    y += dy
  }
  return {
    top: rect.top - y,
    bottom: rect.bottom - y,
    left: rect.left - x,
    right: rect.right - x,
    width: rect.width,
    height: rect.height,
  }
}

/** The translation part of a computed `transform`: `matrix(…)` or `matrix3d(…)`. */
export function translationOf(transform: string): [number, number] {
  const match = /^matrix(3d)?\((.*)\)$/.exec(transform)
  if (!match) return [0, 0]
  const values = match[2]!.split(',').map(Number)
  const [x, y] = match[1] ? [values[12], values[13]] : [values[4], values[5]]
  return [x || 0, y || 0]
}
