import type { CSSProperties, ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Schedule } from '@/domain/schedule/types'
import type { Peer } from '@/features/agenda/document'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { cn } from '@/lib/cn'
import type { Responsible } from '@/domain/agenda/responsible'

/**
 * The agenda, rendered from a flat row list.
 *
 * Deliberately not a <table>: a <tr> cannot be transformed reliably during a
 * drag, and cluster bands fight table layout. Every row is a single grid node
 * sharing one --gw-cols contract, so columns stay aligned across nesting while
 * each row remains individually transformable and printable
 * (`break-inside: avoid`).
 *
 * Below `md` the grid is dropped entirely and rows become cards -- see
 * docs/ui-conventions.md: the reading view on a phone is the most-used
 * screen of this product per workshop, and a horizontally scrolling table is
 * not a reading view.
 */

export const GRID = 'md:grid md:grid-cols-[var(--gw-cols)] md:items-stretch'

/**
 * Turns a row from a rendering into a place you can work.
 *
 * Passed only by the editor; the print view and the phone reading view leave it
 * out and get the same markup, read-only. See the inline-editing rule in
 * docs/ui-conventions.md.
 */
export type RowEditing = {
  onTitleChange: (title: string) => void
  onDurationChange: (minutes: number) => void
  onDescChange: (desc: Record<string, unknown>) => void
  /** Nails the block to a wall-clock time, or lets it float again. */
  onPinChange: (minute: number | null) => void
  /** Who answers for the block. Absent where the list cannot be changed. */
  onResponsibleChange?: (responsible: Responsible[]) => void
  expanded: boolean
  /** Sets the block aside without deleting it. Absent where parking is not offered. */
  onPark?: () => void
  /** Removes it for good. Absent for readers. */
  onRemove?: () => void
  onToggleExpanded: () => void
  details?: ReactNode
}

/**
 * What a row needs to become draggable. The static table passes nothing.
 *
 * dnd-kit's `attributes` and `listeners` deliberately do NOT go on the row:
 * `attributes` sets role="button", which would overwrite the row's own
 * `article` / `group` role and flatten the agenda's accessibility tree into a
 * pile of buttons. They belong on the handle, which is a button anyway. That
 * also stops every click inside a description from starting a drag.
 */
export type RowChrome = {
  rootRef?: (el: HTMLElement | null) => void
  style?: CSSProperties
  /** A focusable drag handle carrying dnd-kit's attributes and listeners. */
  handle?: ReactNode
  isDragging?: boolean
  /** Set while a drag would land inside this cluster. */
  isDropTarget?: boolean
  /** Who else has this row focused right now. */
  presence?: Peer[]
}

/** Hidden on phones: the card layout carries its own labels. */
export function HeaderRow() {
  const t = useTranslations('agenda')
  return (
    <div
      className={cn(
        'hidden border-b border-[var(--border)] pb-2 text-[12px] font-medium tracking-wide text-[var(--fg-subtle)] uppercase',
        GRID,
      )}
    >
      <span />
      <span className="px-2">{t('columns.time')}</span>
      <span />
      <span className="px-3">{t('columns.titleAndDescription')}</span>
      <span className="px-3">{t('columns.info')}</span>
      <span />
    </div>
  )
}

/**
 * Derived, never persisted. A pinned block sitting after the running cursor
 * would otherwise read as an unexplained jump in the time column.
 */
export function GapRow({ minutes }: { minutes: number }) {
  const t = useTranslations('agenda')
  return (
    <div aria-hidden className={cn('items-center', GRID)}>
      <span className="hidden md:block" />
      <span className="hidden md:block" />
      <span className="hidden md:block" />
      <div className="flex items-center gap-2 py-1.5 pl-4 md:col-span-3 md:pl-3">
        <span className="tabular text-[13px] text-[var(--fg-subtle)]">
          {formatDuration(minutes, { spaced: true })} {t('buffer')}
        </span>
        <span className="h-px flex-1 border-t border-dashed border-[var(--border-strong)]" />
      </div>
    </div>
  )
}

export function EndOfDay({
  schedule,
  targetEndMinute,
}: {
  schedule: Schedule
  targetEndMinute: number | null
}) {
  const locale = useLocale()
  const t = useTranslations('agenda')
  const over = targetEndMinute !== null ? schedule.dayEndMinute - targetEndMinute : 0

  return (
    <p className="tabular flex flex-wrap items-baseline gap-2 px-4 py-3 text-[15px] text-[var(--fg-muted)] md:px-2">
      <span className="font-medium text-[var(--fg)]">
        {formatTime(schedule.dayEndMinute, locale)}
      </span>
      <span>{t('end')}</span>
      {over > 0 && (
        <span className="rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-[13px] text-[var(--warn-fg)]">
          {t('overPlan', { duration: formatDuration(over, { spaced: true }) })}
        </span>
      )}
    </p>
  )
}
