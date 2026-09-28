import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ClusterDto } from '@/domain/agenda/types'
import type { CategoryColor } from '@/lib/category-colors'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { formatDuration } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { ColorSelect } from './color-select'
import { PeerMarks } from './presence'
import { TitleInput } from './inline-inputs'
import { OverlapWarning, TimeCell } from './time-cell'
import { GRID, type RowChrome } from './agenda-rows'

/**
 * What an editor may change about a section header.
 *
 * The three things a section is: when it starts, what it is called, what colour
 * it carries. It used to be the pin alone, which was survivable while sections
 * could only arrive over MCP -- a name that could not be changed meant deleting
 * the section and building it again.
 */
export type ClusterEditing = {
  onPinChange: (minute: number | null) => void
  onTitleChange: (title: string) => void
  onColorChange: (color: CategoryColor | null) => void
  /**
   * The section was created a moment ago by the person looking at it, so the
   * cursor belongs in its name. Spent on arrival -- see AgendaEditor.
   */
  autoFocusTitle?: boolean
  /**
   * Removes the cluster AND the blocks inside it.
   *
   * That is what `removeBlock` does with a cluster, and it is the only sensible
   * reading: a section with nothing in it is not a thing somebody wanted left
   * behind. The label says the number out loud, because a delete that quietly
   * takes six blocks with it is a surprise, and the editor has no undo.
   */
  onRemove?: () => void
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
        {/*
          Spanning the last three columns, like GapRow does: a section header
          has no material and no extra info, so leaving those columns empty
          spent 250px on nothing while the name was squeezed out of the one
          column it did have. The two trailing spacers are gone with it -- six
          tracks with a 3-wide item plus two more children would push them into
          a second grid row.

          flex-wrap, and the heading has a floor: a heading must never be the
          item that gives way. With `flex-1 min-w-0` beside siblings that
          cannot shrink it was handed exactly 0px, so the name disappeared
          rather than being shortened. Now the chrome wraps instead.
        */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-l-4 border-[var(--cat-bar)] py-2 pl-3 md:col-span-3 md:px-3">
          {editing ? (
            // Inside the heading, not beside it: the row's accessible name is
            // computed from the heading, and an embedded field still answers
            // for it -- which is what the e2e suite looks a section up by.
            <h2 id={titleId} className="min-w-0 grow basis-full break-words md:min-w-40 md:basis-0">
              <TitleInput
                value={cluster.title}
                onCommit={editing.onTitleChange}
                label={t('section.title')}
                className="text-[15px] text-[var(--cat-fg)]"
                autoFocus={editing.autoFocusTitle}
              />
            </h2>
          ) : (
            <h2
              id={titleId}
              className="min-w-0 text-[15px] font-semibold break-words text-[var(--cat-fg)]"
            >
              {cluster.title}
            </h2>
          )}
          <span className="tabular shrink-0 text-[13px] whitespace-nowrap text-[var(--cat-fg)] opacity-80">
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

          {/*
            Inline, like the delete on a block, and not behind a dialog:
            docs/ui-conventions.md reserves those for confirming the
            irreversible, and this is the same sort of edit as removing a
            block. What it does say out loud is the number going with it --
            `deleteCluster` names the count, because a section that quietly
            takes six blocks with it is a surprise.

            Until now a cluster row offered a pin and nothing else. That was
            survivable while clusters only arrived over MCP; adopting a
            catalogue entry brings one every time, and there was no way to
            take it out again.
          */}
          {editing && (
            <ColorSelect
              value={cluster.color}
              onChange={editing.onColorChange}
              label={t('section.color')}
              // Quiet until the row is touched, like the delete beside it --
              // but never invisible-yet-tappable: on a touch screen there is
              // no hover to reveal it with.
              className="ml-auto shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
            />
          )}

          {editing?.onRemove && (
            <button
              type="button"
              onClick={editing.onRemove}
              aria-label={t('deleteClusterLabel', { title: cluster.title, count: childCount })}
              title={t('deleteClusterHint', { count: childCount })}
              // 44px under a thumb only: an unconditional one makes every
              // section row 44px tall under a mouse. min-w as well as min-h,
              // because the word no longer supplies the width -- and
              // pointer-coarse:opacity, because hidden by opacity but still
              // hit-testable is the worst of both on a touch screen. The
              // colour select beside it carries the ml-auto for the pair.
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded px-1 text-[13px] text-[var(--cat-fg)] opacity-0 group-focus-within:opacity-80 group-hover:opacity-80 hover:text-[var(--danger-fg)] focus-visible:opacity-100 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:opacity-100"
            >
              <Trash2 aria-hidden className="size-3.5" />
              {/*
                The word only where there is room for it, as the library rows
                do: the count and the name are on the button as its accessible
                name either way, so nothing goes missing when it is an icon.
              */}
              <span className="hidden lg:inline">{t('deleteCluster', { count: childCount })}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
