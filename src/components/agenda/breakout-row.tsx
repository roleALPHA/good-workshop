import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { ClusterDto } from '@/domain/agenda/types'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { formatDuration } from '@/features/agenda/duration'
import type { CategoryColor } from '@/lib/category-colors'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { GRID, type RowChrome } from './agenda-rows'
import { ClusterChrome } from './cluster-chrome'
import { PeerMarks } from './presence'
import { OverlapWarning, TimeCell } from './time-cell'

/**
 * A breakout: a section whose strands run at the same time.
 *
 * Its head is an ordinary --gw-cols row, so it lines up with every other time
 * in the agenda. Its body leaves that grid for one of its own, because n
 * strands side by side are not a six-column table.
 *
 * What the head says in WORDS carries the meaning, not the geometry: "3
 * strands, at the same time" and "longest strand 45m". A strand that wraps into
 * a second grid row looks like it comes afterwards, and on a phone the columns
 * are stacked outright -- in both cases the text is what is left.
 */
export type BreakoutEditing = {
  onPinChange: (minute: number | null) => void
  onTitleChange: (title: string) => void
  onColorChange: (color: CategoryColor | null) => void
  autoFocusTitle?: boolean
  onRemove?: () => void
  onAddTrack?: () => void
}

export function BreakoutRow({
  cluster,
  entry,
  trackCount,
  blockCount,
  chrome,
  editing,
  children,
}: {
  cluster: ClusterDto
  entry: ScheduleEntry
  trackCount: number
  /** Every block in every strand -- the delete label names both numbers. */
  blockCount: number
  chrome?: RowChrome
  editing?: BreakoutEditing
  /** The strand columns. */
  children: ReactNode
}) {
  const t = useTranslations('agenda')
  const titleId = `breakout-title-${cluster.id}`

  return (
    <div
      ref={chrome?.rootRef}
      style={chrome?.style}
      role="group"
      aria-labelledby={titleId}
      data-block-id={cluster.id}
      data-breakout={cluster.id}
      className={cn(
        catClass(cluster.color ?? 'slate'),
        // Not sticky, unlike a section: a breakout's strand heads are sticky on
        // a phone instead, because only they can say WHICH strand you are
        // reading. Two stacked sticky bands would eat a third of the screen and
        // need a `top` nobody can work out.
        'group relative border-b border-[var(--border)] bg-[var(--cat-bg)]',
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
                {t('breakout.simultaneous', { count: trackCount })}
                {/*
                  The duration is the MAXIMUM, not the sum, and has to say so.
                  A bare "1h 30m" next to a count reads as a total, and a
                  facilitator would plan the day around a number that is wrong.
                */}
                {trackCount > 0 && (
                  <>
                    {' · '}
                    {t('breakout.longest', {
                      duration: formatDuration(entry.durationMinutes, { spaced: true }),
                    })}
                  </>
                )}
              </>
            }
            labels={{
              title: t('breakout.title'),
              color: t('breakout.color'),
              delete: t('breakout.delete', { count: trackCount }),
              deleteLabel: t('breakout.deleteLabel', {
                title: cluster.title,
                tracks: trackCount,
                blocks: blockCount,
              }),
              deleteHint: t('breakout.deleteHint'),
            }}
          >
            {entry.conflict?.kind === 'overlap' && (
              <OverlapWarning minutes={entry.conflict.minutes} />
            )}
          </ClusterChrome>
        </div>
      </div>

      {/*
        The body. One column below md -- the grid-cols rule simply is not
        applied there -- which is the same mechanism the rest of the agenda
        collapses by, rather than a second layout to keep in step.
      */}
      <div className="grid gap-x-4 gap-y-0 pb-2 md:grid-cols-[repeat(auto-fit,minmax(var(--gw-track-min),1fr))] md:pl-[72px]">
        {children}
        {editing?.onAddTrack && (
          <button
            type="button"
            onClick={editing.onAddTrack}
            // The last cell of the grid, where a new column would appear. The
            // raster explains itself that way, instead of a button somewhere
            // above it explaining the raster.
            className="m-2 inline-flex min-h-11 items-center justify-center gap-1 rounded border border-dashed border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--fg-muted)] hover:border-[var(--cat-bar)] hover:text-[var(--fg)]"
          >
            <Plus aria-hidden className="size-4 shrink-0" />
            {t('breakout.addTrack')}
          </button>
        )}
      </div>
    </div>
  )
}
