'use client'

import { useMemo, useRef, useState } from 'react'
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useLocale, useTranslations } from 'next-intl'
import type { DayDoc } from '@/domain/agenda/types'
import { ImmediateKeyboardSensor } from './keyboard'
import { describeProjection } from './drag-announcement'
import type { flattenDay } from './flatten'
import { getProjection, rowsForDrag, toProjectionRows, type Projection } from './projection'
import {
  INDENT_PX,
  KEYBOARD_OPTIONS,
  MOUSE_OPTIONS,
  TOUCH_OPTIONS,
} from '@/components/agenda/agenda-dnd'

/**
 * Dragging a row of the agenda, with everything that makes it survive a keyboard.
 *
 * A hook rather than state inside the editor, because the awkward parts have
 * nothing to do with rendering and everything to do with how dnd-kit reports a
 * drag: the first delta is a position and not a movement, the first collision is
 * measured from the handle and not the row, and `over` is one event behind on
 * onDragMove. Each of those cost a bug, each is explained where it is handled,
 * and none of them belongs in a component that is otherwise about a table.
 *
 * What comes back is exactly what a DndContext and the rows need -- the sensors,
 * the five handlers, the projected landing spot, and the sentence a screen reader
 * is read.
 */
export function useAgendaDrag({
  doc,
  rows,
  onMove,
}: {
  doc: DayDoc
  rows: ReturnType<typeof flattenDay>
  /** Applies the move. Called only for a projection that is valid. */
  onMove: (activeId: string, projection: Projection) => void
}) {
  const t = useTranslations('agenda')
  const locale = useLocale()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  /** Whether this drag has moved at all yet. See handleDragOver. */
  const movedRef = useRef(false)
  /** The delta this drag opened with; see handleDragMove. */
  const startDeltaRef = useRef<{ x: number; y: number } | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // The list the drag operates on: gaps removed, and a dragged cluster's
  // children taken out so it travels as one unit.
  const dragRows = useMemo(
    () => (activeId ? rowsForDrag(toProjectionRows(rows), activeId) : toProjectionRows(rows)),
    [rows, activeId],
  )

  // Mouse and keyboard agree on what the horizontal offset means: a pointer
  // drags x by hand, arrow keys step it by exactly one INDENT_PX at a time.
  const projection: Projection | null =
    activeId && overId ? getProjection(dragRows, activeId, overId, offsetX, INDENT_PX) : null

  const sortableIds = useMemo(() => dragRows.map((r) => r.id), [dragRows])

  const [dropMessage, setDropMessage] = useState('')

  const liveMessage = activeId
    ? describeProjection(doc, rows, activeId, projection, t, locale)
    : dropMessage

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
    useSensor(ImmediateKeyboardSensor, KEYBOARD_OPTIONS),
  )

  function handleDragStart(event: DragStartEvent) {
    setDropMessage('')
    setActiveId(String(event.active.id))
    setOffsetX(0)
    setOverId(String(event.active.id))
    movedRef.current = false
    startDeltaRef.current = null
  }

  function handleDragMove(event: DragMoveEvent) {
    // The first delta of a drag is where it STARTED, not a movement.
    //
    // dnd-kit measures from the activator, and a keyboard drag opens with a
    // vertical delta of its own before anybody has pressed anything -- the
    // handle does not sit in the middle of its row, and focusing it scrolls
    // the page. Comparing against zero would work only while that offset
    // stays small enough not to matter, which is a fact about row height and
    // not about dragging.
    const start = startDeltaRef.current
    if (start === null) startDeltaRef.current = { x: event.delta.x, y: event.delta.y }
    else if (event.delta.x !== start.x || event.delta.y !== start.y) movedRef.current = true

    setOffsetX(event.delta.x)
  }

  /**
   * Which row we are over comes from onDragOver, never from onDragMove.
   *
   * onDragMove carries an `over` that dnd-kit has not recomputed yet -- it
   * still names the row from before this move. A pointer hides that: moves
   * arrive in a stream and the next one corrects it. A keyboard produces
   * exactly one move per key press, so reading it there means the projection is
   * permanently one press behind and the row never actually goes anywhere.
   */
  function handleDragOver(event: DragOverEvent) {
    // ... except for the one that arrives before anything has moved.
    //
    // dnd-kit runs collision detection once at pickup, and the overlay is then
    // sitting where the drag HANDLE is rather than over the row's own box. So
    // that first collision reports whichever neighbour the offset rectangle
    // happens to touch -- for a day-level block below a section, the section's
    // last child. Taking it as the projection nests the block before a key has
    // been pressed, and the depth is then already at its maximum, so the
    // ArrowRight this whole feature exists for has nothing left to do.
    //
    // It surfaced when the rows grew by fifteen pixels, which is the tell: a
    // correctness that depends on a row height is not one.
    //
    // handleDragStart has already set the only right answer for that moment:
    // the row is over itself.
    if (!movedRef.current) return
    if (event.over) setOverId(String(event.over.id))
  }

  function reset() {
    setActiveId(null)
    setOverId(null)
    setOffsetX(0)
    movedRef.current = false
    startDeltaRef.current = null
  }

  function handleDragEnd() {
    if (activeId && projection?.valid) {
      // Its own message rather than a word swapped out of the previous one.
      // `.replace('landet', 'abgelegt')` worked only in German, and only until
      // somebody rephrased the sentence it was reaching into.
      setDropMessage(describeProjection(doc, rows, activeId, projection, t, locale, 'dropped'))
      onMove(activeId, projection)
    }
    reset()
  }

  function handleDragCancel() {
    if (activeId) setDropMessage(t('drag.cancelled'))
    reset()
  }
  return {
    activeId,
    overId,
    projection,
    dragRows,
    sortableIds,
    sensors,
    liveMessage,
    handlers: {
      onDragStart: handleDragStart,
      onDragMove: handleDragMove,
      onDragOver: handleDragOver,
      onDragEnd: handleDragEnd,
      onDragCancel: handleDragCancel,
    },
  }
}
