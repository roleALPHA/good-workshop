import { useTranslations } from 'next-intl'
import type { ClusterDto } from '@/domain/agenda/types'
import type { CategoryColor } from '@/lib/category-colors'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { formatDuration } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { ClusterChrome } from './cluster-chrome'
import { PeerMarks } from './presence'
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
          <ClusterChrome
            titleId={titleId}
            title={cluster.title}
            color={cluster.color}
            editing={
              editing && {
                onTitleChange: editing.onTitleChange,
                onColorChange: editing.onColorChange,
                autoFocusTitle: editing.autoFocusTitle,
                onRemove: editing.onRemove,
              }
            }
            meta={
              <>
                {t('blockCount', { count: childCount })} ·{' '}
                {formatDuration(entry.durationMinutes, { spaced: true })}
              </>
            }
            labels={{
              title: t('section.title'),
              color: t('section.color'),
              delete: t('deleteCluster', { count: childCount }),
              deleteLabel: t('deleteClusterLabel', { title: cluster.title, count: childCount }),
              deleteHint: t('deleteClusterHint', { count: childCount }),
            }}
          >
            {/*
              A section can be pinned too, so it can overrun too. Without this
              the conflict was computed and then never said out loud.
            */}
            {entry.conflict?.kind === 'overlap' && (
              <OverlapWarning minutes={entry.conflict.minutes} />
            )}
          </ClusterChrome>
        </div>
      </div>
    </div>
  )
}
