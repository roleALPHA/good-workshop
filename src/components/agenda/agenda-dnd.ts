import {
  closestCorners,
  pointerWithin,
  type Announcements,
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
                value: Math.abs(rect.top - collisionRect.top),
              },
            },
          ]
        : []
    })
    .sort((a, b) => a.data.value - b.data.value)
}
