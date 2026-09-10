import type { CSSProperties, ReactNode } from 'react'
import type { ClusterDto, ModuleDto, ModuleTypeDto } from '@/domain/agenda/types'
import type { Schedule, ScheduleEntry } from '@/domain/schedule/types'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { isRichTextValue } from '@/lib/richtext/schema'
import { RichText } from '@/lib/richtext/render'
import { OverlapWarning, TimeCell } from './time-cell'

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
 * .claude/skills/goodworkshop-ui: the reading view on a phone is the most-used
 * screen of this product per workshop, and a horizontally scrolling table is
 * not a reading view.
 */

export const GRID = 'md:grid md:grid-cols-[var(--gw-cols)] md:items-stretch'

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
}

/** Hidden on phones: the card layout carries its own labels. */
export function HeaderRow() {
  return (
    <div
      className={cn(
        'hidden border-b border-[var(--border)] pb-2 text-[12px] font-medium tracking-wide text-[var(--fg-subtle)] uppercase',
        GRID,
      )}
    >
      <span />
      <span className="px-2">Zeit</span>
      <span />
      <span className="px-3">Titel und Beschreibung</span>
      <span className="px-3">Zusatzinfo</span>
      <span />
    </div>
  )
}

export function ModuleRow({
  module: mod,
  type,
  entry,
  nested,
  chrome,
}: {
  module: ModuleDto
  type: ModuleTypeDto | undefined
  entry: ScheduleEntry
  nested: boolean
  chrome?: RowChrome
}) {
  const description = isRichTextValue(mod.desc.description) ? mod.desc.description : null
  const info = additionalInfo(mod)

  const titleId = `module-title-${mod.id}`

  return (
    <article
      ref={chrome?.rootRef}
      style={chrome?.style}
      aria-labelledby={titleId}
      className={cn(
        catClass(type?.color),
        'group relative break-inside-avoid border-b border-[var(--border)]',
        chrome?.isDragging && 'opacity-40',
        GRID,
      )}
    >
      {chrome?.handle}
      {/* Phone: the category bar is the card's left edge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-[var(--cat-bar)] md:hidden"
        style={nested ? { left: '0.75rem' } : undefined}
      />

      <span className="hidden md:block" />

      <div className={cn('pt-3 pb-3 pl-4 md:px-2 md:pl-2', nested && 'pl-7 md:pl-2')}>
        <TimeCell entry={entry} />
      </div>

      <span className="hidden md:block" />

      <div
        className={cn(
          'pb-3 pl-4 md:border-l-4 md:border-[var(--cat-bar)] md:px-3 md:pt-3 md:pl-3',
          nested && 'pl-7 md:ml-7 md:pl-3',
        )}
      >
        <h3 id={titleId} className="font-semibold text-[var(--fg)]">
          {mod.title}
        </h3>
        {type && <p className="mt-0.5 text-[13px] text-[var(--cat-fg)] md:hidden">{type.name}</p>}
        {description && (
          <RichText value={description} className="mt-1 text-[15px] text-[var(--fg-muted)]" />
        )}
        {entry.conflict?.kind === 'overlap' && <OverlapWarning minutes={entry.conflict.minutes} />}
      </div>

      <div className={cn('pb-3 pl-4 md:px-3 md:pt-3 md:pl-3', nested && 'pl-7 md:pl-3')}>
        {info.length > 0 && <InfoChips items={info} />}
      </div>

      <span className="hidden md:block" />
    </article>
  )
}

export function ClusterRow({
  cluster,
  entry,
  childCount,
  chrome,
}: {
  cluster: ClusterDto
  entry: ScheduleEntry
  childCount: number
  chrome?: RowChrome
}) {
  const titleId = `cluster-title-${cluster.id}`

  return (
    <div
      ref={chrome?.rootRef}
      style={chrome?.style}
      role="group"
      aria-labelledby={titleId}
      // aria-expanded belongs on the disclosure BUTTON, not on the group it
      // controls -- role="group" does not support it. It moves onto the chevron
      // when that lands, together with aria-controls.
      className={cn(
        catClass(cluster.color ?? 'slate'),
        // Sticky on phones so you always know which section you are reading.
        'group sticky top-0 z-10 break-inside-avoid border-b border-[var(--border)] bg-[var(--cat-bg)] md:static',
        chrome?.isDragging && 'opacity-40',
        chrome?.isDropTarget && 'ring-2 ring-[var(--cat-bar)] ring-inset',
      )}
    >
      {chrome?.handle}
      <div className={cn('items-center', GRID)}>
        <span className="hidden md:block" />
        <div className="hidden py-2 md:block md:px-2">
          <TimeCell entry={entry} showDuration={false} />
        </div>
        <span className="hidden md:block" />
        <div className="flex items-baseline gap-2 border-l-4 border-[var(--cat-bar)] py-2 pl-3 md:px-3">
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--cat-fg)]">
            {cluster.title}
          </h2>
          <span className="tabular text-[13px] text-[var(--cat-fg)] opacity-80">
            {childCount} {childCount === 1 ? 'Block' : 'Blöcke'} ·{' '}
            {formatDuration(entry.durationMinutes, { spaced: true })}
          </span>
        </div>
        <span className="hidden md:block" />
        <span className="hidden md:block" />
      </div>
    </div>
  )
}

/**
 * Derived, never persisted. A pinned block sitting after the running cursor
 * would otherwise read as an unexplained jump in the time column.
 */
export function GapRow({ minutes }: { minutes: number }) {
  return (
    <div aria-hidden className={cn('items-center', GRID)}>
      <span className="hidden md:block" />
      <span className="hidden md:block" />
      <span className="hidden md:block" />
      <div className="flex items-center gap-2 py-1.5 pl-4 md:col-span-3 md:pl-3">
        <span className="tabular text-[13px] text-[var(--fg-subtle)]">
          {formatDuration(minutes, { spaced: true })} Puffer
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
  const over = targetEndMinute !== null ? schedule.dayEndMinute - targetEndMinute : 0

  return (
    <p className="tabular flex flex-wrap items-baseline gap-2 px-4 py-3 text-[15px] text-[var(--fg-muted)] md:px-2">
      <span className="font-medium text-[var(--fg)]">{formatTime(schedule.dayEndMinute)}</span>
      <span>Ende</span>
      {over > 0 && (
        <span className="rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-[13px] text-[var(--warn-fg)]">
          {formatDuration(over, { spaced: true })} über Plan
        </span>
      )}
    </p>
  )
}

function InfoChips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((item) => (
        <li
          key={item}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]"
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

/**
 * Only a handful of `desc` fields ever reach the table: the ones a module type
 * flags with `x-gw.summary`. Everything else lives in the inspector. The moment
 * arbitrary schema fields render inline, the product becomes a database admin
 * panel.
 */
function additionalInfo(mod: ModuleDto): string[] {
  const out: string[] = []
  const materials = mod.desc.materials
  if (Array.isArray(materials))
    out.push(...materials.filter((m): m is string => typeof m === 'string'))
  if (typeof mod.desc.catering_note === 'string') out.push(mod.desc.catering_note)
  if (typeof mod.desc.deliverable === 'string') out.push(mod.desc.deliverable)
  return out
}
