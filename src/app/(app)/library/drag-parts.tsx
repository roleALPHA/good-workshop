'use client'

import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/cn'
import type { ActiveDrag } from '@/features/library/drag'
import { useLibraryDrag } from './library-dnd'

/**
 * The button that opens the move list is also what you drag.
 *
 * One control, two mechanisms. A grip of its own would be a third 44px target
 * in a 200px sidebar, and putting the listeners on the row is worse still: the
 * row is a link, and a link that also drags either navigates at the end of a
 * drag or stops responding to ordinary clicks.
 *
 * The two do not collide because the mouse sensor only activates after 6px and
 * the touch sensor after a 200ms hold -- a click and a tap never reach either,
 * so `onClick` fires as it always did.
 */
export function MoveControl({
  drag,
  expanded,
  onToggle,
  label,
  hint,
  disabled,
  className,
  children,
}: {
  drag: ActiveDrag
  expanded: boolean
  onToggle: () => void
  label: string
  hint: string
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  const { dragEnabled } = useLibraryDrag()

  // Below `md` the folder tree sits behind a disclosure, so there is nothing
  // visible to aim at -- and outside the provider entirely (component tests,
  // and any future surface reusing the row) there is no DndContext to register
  // with. Two components rather than a conditional hook.
  return dragEnabled ? (
    <DraggableMoveControl
      drag={drag}
      expanded={expanded}
      onToggle={onToggle}
      label={label}
      hint={hint}
      disabled={disabled}
      className={className}
    >
      {children}
    </DraggableMoveControl>
  ) : (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={expanded}
      aria-label={label}
      title={hint}
      className={className}
    >
      {children}
    </button>
  )
}

function DraggableMoveControl({
  drag,
  expanded,
  onToggle,
  label,
  hint,
  disabled,
  className,
  children,
}: {
  drag: ActiveDrag
  expanded: boolean
  onToggle: () => void
  label: string
  hint: string
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: drag.id,
    data: drag,
    disabled,
  })

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={expanded}
      aria-label={label}
      title={hint}
      // touch-action only here: the list and the tree must stay scrollable
      // under a finger.
      className={cn(className, 'touch-none', isDragging && 'opacity-40')}
    >
      {children}
    </button>
  )
}

/**
 * A row that something can be dropped on.
 *
 * Registers nothing when dragging is off, which is also what keeps these rows
 * renderable without a DndContext above them.
 */
export function DropTarget({
  id,
  children,
}: {
  id: string
  children: (state: { ref?: (node: HTMLElement | null) => void }) => ReactNode
}) {
  const { dragEnabled } = useLibraryDrag()
  return dragEnabled ? (
    <RegisteredDropTarget id={id}>{children}</RegisteredDropTarget>
  ) : (
    children({})
  )
}

function RegisteredDropTarget({
  id,
  children,
}: {
  id: string
  children: (state: { ref?: (node: HTMLElement | null) => void }) => ReactNode
}) {
  const { setNodeRef } = useDroppable({ id })
  return children({ ref: setNodeRef })
}
