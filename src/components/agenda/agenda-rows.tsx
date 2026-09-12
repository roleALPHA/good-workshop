import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, Inbox, NotebookPen, Trash2 } from 'lucide-react'
import type { ClusterDto, ModuleDto, ModuleTypeDto } from '@/domain/agenda/types'
import type { Peer } from '@/features/agenda/document'
import type { Schedule, ScheduleEntry } from '@/domain/schedule/types'
import { setDescField, stringList } from '@/domain/moduleType/desc'
import { findField, parseSchema, summaryChips } from '@/domain/moduleType/profile'
import type { SummaryChip } from '@/domain/moduleType/profile'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { isRichTextValue } from '@/lib/richtext/schema'
import { toPlainText } from '@/lib/richtext/plain'
import { RichText } from '@/lib/richtext/render'
import { ChipsInput } from './chips-input'
import { ParticipationBadge, ParticipationControl } from './participation-control'
import { PeerMarks } from './presence'
import { TitleInput } from './inline-inputs'
import { OverlapWarning, TimeCell } from './time-cell'
import { useLocale, useTranslations } from 'next-intl'

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
 * What a row needs to become draggable. The static table passes nothing.
 *
 * dnd-kit's `attributes` and `listeners` deliberately do NOT go on the row:
 * `attributes` sets role="button", which would overwrite the row's own
 * `article` / `group` role and flatten the agenda's accessibility tree into a
 * pile of buttons. They belong on the handle, which is a button anyway. That
 * also stops every click inside a description from starting a drag.
 */
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
  expanded: boolean
  /** Sets the block aside without deleting it. Absent where parking is not offered. */
  onPark?: () => void
  /** Removes it for good. Absent for readers. */
  onRemove?: () => void
  onToggleExpanded: () => void
  details?: ReactNode
}

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

export function ModuleRow({
  module: mod,
  type,
  entry,
  nested,
  chrome,
  editing,
}: {
  module: ModuleDto
  type: ModuleTypeDto | undefined
  entry: ScheduleEntry
  nested: boolean
  chrome?: RowChrome
  editing?: RowEditing
}) {
  const t = useTranslations('agenda')
  const description = isRichTextValue(mod.desc.description) ? mod.desc.description : null

  const groups = parseSchema(type?.jsonSchema)
  // Both are offered only where the type actually declares them. A control for
  // a field the schema does not know would write a value that
  // `additionalProperties: false` rejects on the way to the database -- and the
  // editor would go on showing it.
  const participation = findField(groups, 'participation')
  const materialField = findField(groups, 'materials')
  const materials = stringList(mod.desc.materials)
  // Material has its own control in the editor, so it must not also arrive as
  // a read-only chip beside it.
  const info = summaryChips(groups, mod.desc, editing ? ['materials'] : [])
  const hasNotes = hasFacilitatorNotes(mod)

  const writeDesc = (key: string, value: unknown) =>
    editing?.onDescChange(setDescField(mod.desc, key, value))

  const titleId = `module-title-${mod.id}`

  return (
    <article
      ref={chrome?.rootRef}
      style={chrome?.style}
      aria-labelledby={titleId}
      data-block-id={mod.id}
      className={cn(
        catClass(type?.color),
        'group relative break-inside-avoid border-b border-[var(--border)]',
        chrome?.isDragging && 'opacity-40',
        GRID,
      )}
    >
      {chrome?.handle}
      {chrome?.presence ? <PeerMarks peers={chrome.presence} /> : null}
      {/* Phone: the category bar is the card's left edge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-[var(--cat-bar)] md:hidden"
        style={nested ? { left: '0.75rem' } : undefined}
      />

      <span className="hidden md:block" />

      <div className={cn('pt-3 pb-3 pl-4 md:px-2 md:pl-2', nested && 'pl-7 md:pl-2')}>
        <TimeCell
          entry={entry}
          editing={editing && { ...editing, pinnedStartMinute: mod.pinnedStartMinute }}
        >
          {participation &&
            (editing ? (
              <ParticipationControl
                field={participation}
                value={
                  typeof mod.desc.participation === 'string' ? mod.desc.participation : undefined
                }
                onChange={(value) => writeDesc('participation', value)}
              />
            ) : (
              <ParticipationBadge
                field={participation}
                value={
                  typeof mod.desc.participation === 'string' ? mod.desc.participation : undefined
                }
              />
            ))}
        </TimeCell>
      </div>

      <span className="hidden md:block" />

      <div
        className={cn(
          'pb-3 pl-4 md:border-l-4 md:border-[var(--cat-bar)] md:px-3 md:pt-3 md:pl-3',
          nested && 'pl-7 md:ml-7 md:pl-3',
        )}
      >
        {editing ? (
          <h3 id={titleId}>
            <TitleInput value={mod.title} onCommit={editing.onTitleChange} />
          </h3>
        ) : (
          <h3 id={titleId} className="font-semibold text-[var(--fg)]">
            {mod.title}
          </h3>
        )}
        {type && <p className="mt-0.5 text-[13px] text-[var(--cat-fg)] md:hidden">{type.name}</p>}
        {description && (
          <RichText value={description} className="mt-1 text-[15px] text-[var(--fg-muted)]" />
        )}
        {entry.conflict?.kind === 'overlap' && <OverlapWarning minutes={entry.conflict.minutes} />}

        {editing && (
          <>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={editing.onToggleExpanded}
                aria-expanded={editing.expanded}
                aria-controls={`details-${mod.id}`}
                className="mt-1.5 -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
              >
                <ChevronDown
                  aria-hidden
                  className={cn('size-3.5 transition-transform', editing.expanded && 'rotate-180')}
                />
                {editing.expanded ? t('fewerFields') : t('moreFields')}
              </button>

              {/*
                Editor only. The field is the facilitator's own ("nur für
                dich"), and the read-only table is what a participant is handed
                -- a marker there would announce that private notes exist.
              */}
              {hasNotes && !editing.expanded && (
                <button
                  type="button"
                  onClick={editing.onToggleExpanded}
                  aria-controls={`details-${mod.id}`}
                  aria-expanded={editing.expanded}
                  title={t('notes')}
                  aria-label={t('notes')}
                  className="mt-1.5 inline-flex items-center rounded px-1 py-0.5 text-[var(--fg-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--fg-muted)]"
                >
                  <NotebookPen aria-hidden className="size-3.5" />
                </button>
              )}

              {editing.onPark && (
                <button
                  type="button"
                  onClick={editing.onPark}
                  aria-label={t('parkLabel', { title: mod.title })}
                  title={t('parkHint')}
                  className="mt-1.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
                >
                  <Inbox aria-hidden className="size-3.5" />
                  {t('park')}
                </button>
              )}

              {editing.onRemove && (
                <button
                  type="button"
                  onClick={editing.onRemove}
                  aria-label={t('deleteLabel', { title: mod.title })}
                  title={t('deleteHint')}
                  className="mt-1.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--danger-fg)]"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                  {t('delete')}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className={cn('space-y-1 pb-3 pl-4 md:px-3 md:pt-3 md:pl-3', nested && 'pl-7 md:pl-3')}>
        {info.length > 0 && <InfoChips items={info} />}
        {editing && materialField && (
          <ChipsInput
            values={materials}
            onChange={(next) => writeDesc('materials', next.length > 0 ? next : undefined)}
            addLabel={t('materials.add')}
            removeLabel={(name) => t('materials.remove', { name })}
            placeholder={t('materials.placeholder')}
          />
        )}
      </div>

      <span className="hidden md:block" />

      {/*
        A child of the ROW's grid, spanning all of it, rather than a child of the
        title cell.
        Inside that cell the panel was as wide as one column: on a desktop window
        a full-width text field stopped halfway across while the column beside it
        stayed empty. The fields lay themselves out on twelve columns, and they
        can only use them if they are given the width.
      */}
      {editing?.expanded && (
        <div
          id={`details-${mod.id}`}
          className={cn(
            'mb-3 ml-4 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3',
            'md:col-span-full md:mr-3 md:ml-3',
            nested && 'ml-7 md:ml-10',
          )}
        >
          {editing.details}
        </div>
      )}
    </article>
  )
}

/**
 * What an editor may change about a section header.
 *
 * The pin, and nothing else. A section's title and colour are a separate
 * feature with their own questions; bundling them here is how "the minimal
 * shape" stops being minimal.
 */
export type ClusterEditing = {
  onPinChange: (minute: number | null) => void
}

export function ClusterRow({
  cluster,
  entry,
  childCount,
  chrome,
  editing,
}: {
  cluster: ClusterDto
  entry: ScheduleEntry
  childCount: number
  chrome?: RowChrome
  editing?: ClusterEditing
}) {
  const t = useTranslations('agenda')
  const titleId = `cluster-title-${cluster.id}`

  return (
    <div
      ref={chrome?.rootRef}
      style={chrome?.style}
      role="group"
      aria-labelledby={titleId}
      // Read by the table's one focus handler to work out which row somebody
      // is in, so a new field never has to remember to report itself.
      data-block-id={cluster.id}
      // aria-expanded belongs on the disclosure BUTTON, not on the group it
      // controls -- role="group" does not support it. It moves onto the chevron
      // when that lands, together with aria-controls.
      className={cn(
        catClass(cluster.color ?? 'slate'),
        // Sticky on phones so you always know which section you are reading.
        // md:relative rather than md:static: unsticky on desktop, but still a
        // positioning context for the presence mark.
        'group sticky top-0 z-10 break-inside-avoid border-b border-[var(--border)] bg-[var(--cat-bg)] md:relative',
        chrome?.isDragging && 'opacity-40',
        chrome?.isDropTarget && 'ring-2 ring-[var(--cat-bar)] ring-inset',
      )}
    >
      {chrome?.handle}
      {chrome?.presence ? <PeerMarks peers={chrome.presence} /> : null}
      <div className={cn('items-center', GRID)}>
        <span className="hidden md:block" />
        <div className="hidden py-2 md:block md:px-2">
          <TimeCell
            entry={entry}
            showDuration={false}
            editing={
              editing && {
                onPinChange: editing.onPinChange,
                pinnedStartMinute: cluster.pinnedStartMinute,
              }
            }
          />
        </div>
        <span className="hidden md:block" />
        <div className="flex items-baseline gap-2 border-l-4 border-[var(--cat-bar)] py-2 pl-3 md:px-3">
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--cat-fg)]">
            {cluster.title}
          </h2>
          <span className="tabular text-[13px] text-[var(--cat-fg)] opacity-80">
            {t('blockCount', { count: childCount })} ·{' '}
            {formatDuration(entry.durationMinutes, { spaced: true })}
          </span>
          {/*
            A section can be pinned too, so it can overrun too. Without this the
            conflict was computed and then never said out loud.
          */}
          {entry.conflict?.kind === 'overlap' && (
            <OverlapWarning minutes={entry.conflict.minutes} />
          )}
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

function InfoChips({ items }: { items: SummaryChip[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((item) => (
        <li
          key={`${item.key}:${item.text}`}
          // The field's own name, so a chip reading "Mira" is not a riddle for
          // anyone using a screen reader.
          title={item.label}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]"
        >
          <span className="sr-only">{item.label}: </span>
          {item.text}
        </li>
      ))}
    </ul>
  )
}

/**
 * Whether there is a facilitator note worth pointing at.
 *
 * An empty rich-text document is still a document, so the text has to be
 * looked at rather than the key.
 */
function hasFacilitatorNotes(mod: ModuleDto): boolean {
  const notes = mod.desc.facilitator_notes
  return isRichTextValue(notes) && toPlainText(notes).trim() !== ''
}
