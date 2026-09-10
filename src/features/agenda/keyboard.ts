import {
  KeyboardCode,
  KeyboardSensor,
  type KeyboardCoordinateGetter,
  type KeyboardSensorProps,
} from '@dnd-kit/core'
import type { Coordinates } from '@dnd-kit/utilities'

type CoordinateArgs = Parameters<KeyboardCoordinateGetter>[1]

/**
 * Keyboard geometry for a tree that is rendered as a flat list.
 *
 * Vertical keys move the row by exactly one position, horizontal keys change
 * its depth by exactly one step, and neither axis leaks into the other. Both
 * halves of that are deliberate.
 *
 * Horizontal, because nesting in this editor *is* the x offset: `getProjection`
 * divides the drag's horizontal delta by `indentPx`. Left and right therefore
 * step x themselves rather than being handed to the sortable helper.
 *
 * Vertical, because `sortableKeyboardCoordinates` answers ArrowDown with a
 * *bottom-aligned* coordinate -- the target's top plus the difference between
 * the two rows' heights. On a uniform list that is the same thing as the next
 * row; on this one, where a block with a bullet list is four times the height
 * of a break, it lands somewhere between two rows and the projection either
 * skips a position or does not move at all. Worse, dnd-kit turns a downward key
 * into a plain scroll whenever the target sits below the middle of the viewport
 * and lets the re-collision do the work -- which only lands on the intended row
 * if the scroll distance is exactly the distance between the two rows' tops.
 *
 * Aligning to the target's top satisfies both paths: whether dnd-kit moves the
 * drag or scrolls the page underneath it, the dragged rect ends up exactly on
 * the target's box, and collision detection has a zero-distance answer instead
 * of a judgement call between neighbours of different heights.
 */
export function treeKeyboardCoordinateGetter(indentPx: number): KeyboardCoordinateGetter {
  return (event, args) => {
    const { x, y } = args.currentCoordinates

    switch (event.code) {
      case KeyboardCode.Left:
        event.preventDefault()
        return { x: x - indentPx, y }
      case KeyboardCode.Right:
        event.preventDefault()
        return { x: x + indentPx, y }
      case KeyboardCode.Up:
        event.preventDefault()
        return neighbourRow(args, -1)
      case KeyboardCode.Down:
        event.preventDefault()
        return neighbourRow(args, 1)
      default:
        return undefined
    }
  }
}

/**
 * The row one step above or below the one the drag currently sits on.
 *
 * Rows are ordered by their measured top edge, which dnd-kit measures free of
 * transforms -- so this is the document's own order, the same order
 * `getProjection` indexes into, and it does not shift while the list reshuffles
 * underneath the drag.
 */
function neighbourRow(args: CoordinateArgs, step: -1 | 1): Coordinates | undefined {
  const { collisionRect, droppableRects, droppableContainers, over } = args.context
  if (!collisionRect) return undefined

  const rows = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      return rect ? [{ id: container.id, top: rect.top }] : []
    })
    .sort((a, b) => a.top - b.top)

  // Where the drag is *projected*, not where it started: holding ArrowDown has
  // to walk the list, not re-answer the same question about the original row.
  const fromId = over?.id ?? args.active
  const from = rows.findIndex((row) => row.id === fromId)
  const target = from === -1 ? undefined : rows[from + step]

  // x is carried over untouched: the row we land on may be indented differently
  // than the one we left, and adopting its left edge would read as an indent
  // the user never asked for.
  return target ? { x: collisionRect.left, y: target.top } : undefined
}

/**
 * dnd-kit's KeyboardSensor, minus the window in which it is deaf.
 *
 * `KeyboardSensor.attach()` registers its document keydown listener inside a
 * `setTimeout`, so between picking a row up and that timer firing the sensor
 * hears nothing: Space and Escape land on a listener that does not exist yet
 * and the drag simply stays open. The window is not theoretical. Drag start
 * re-renders every row and, with `MeasuringStrategy.Always`, re-measures every
 * droppable; that keeps the main thread busy for ~20ms on the demo day and
 * proportionally longer on a real one, and Chrome runs a pending input event
 * ahead of a pending timer. A fast keyboard user loses their first press after
 * pickup -- which is also why the first ArrowLeft used to look swallowed.
 *
 * So we add the very same handler ourselves, immediately. `handleKeyDown` is
 * bound in the base constructor and the deferred `add` reads it off the
 * instance when the timer fires, so swapping in a wrapper here means both
 * registrations are the identical function -- and `addEventListener` ignores a
 * duplicate. Guarding against the activating press keeps Space from both
 * opening and closing the drag in one go; the DOM would not hand that event to
 * a listener added during its own dispatch, but this does not lean on it.
 */
export class ImmediateKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    super(props)

    const sensor = this as unknown as KeyboardSensorInternals
    const activatingEvent = sensor.props.event
    const handleKeyDown = sensor.handleKeyDown

    const guarded: EventListener = (event) => {
      if (event !== activatingEvent) handleKeyDown(event)
    }

    sensor.handleKeyDown = guarded
    sensor.listeners.add('keydown', guarded)
  }
}

/** The parts of KeyboardSensor we reach into; all `private` to TypeScript. */
type KeyboardSensorInternals = {
  props: { event: Event }
  listeners: { add(eventName: string, handler: EventListener): void }
  handleKeyDown: EventListener
}
