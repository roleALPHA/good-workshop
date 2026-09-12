'use client'

import { GripVertical } from 'lucide-react'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { cn } from '@/lib/cn'
import { useTranslations } from 'next-intl'

/**
 * The only element that starts a drag.
 *
 * Hidden until the row is hovered OR anything inside it has focus -- there is
 * no hover on touch, and a keyboard user must be able to reach it. It is a real
 * button so dnd-kit's keyboard sensor has something focusable to attach to.
 */
export function DragHandle({
  attributes,
  listeners,
  label,
  nested,
}: {
  attributes: DraggableAttributes
  listeners: SyntheticListenerMap | undefined
  label: string
  nested?: boolean
}) {
  const t = useTranslations('agenda')
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={t('dragHandle', { title: label })}
      className={cn(
        'absolute top-2.5 z-20 grid size-8 place-items-center rounded text-[var(--fg-subtle)] opacity-0 transition-opacity duration-100',
        'group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
        // Where there is no hover, the handle is simply there. Long-pressing an
        // invisible button is not a gesture anybody discovers.
        'pointer-coarse:opacity-100',
        'hover:bg-[var(--surface-raised)] hover:text-[var(--fg-muted)]',
        // touch-action: none only here -- the row itself must stay scrollable.
        'touch-none',
        nested ? 'left-[-18px] md:left-1' : 'left-[-26px] md:left-0',
      )}
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  )
}
