import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { ClusterDto, ModuleTypeDto } from '@/domain/agenda/types'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { useLocale } from 'next-intl'
import type { CategoryColor } from '@/lib/category-colors'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { BlockTypeList } from './block-type-list'
import { ClusterChrome } from './cluster-chrome'
import type { RowChrome } from './agenda-rows'
import { PeerMarks } from './presence'

/**
 * One strand of a breakout: its own little agenda, in its own room.
 *
 * The head carries its position in words -- "strand 2 of 3" -- and that is not
 * decoration. On a phone the columns are stacked, and past the auto-fit width
 * they wrap into a second row; in both cases the only thing left saying these
 * run at the same time is the text.
 */
export type TrackEditing = {
  onTitleChange: (title: string) => void
  onColorChange: (color: CategoryColor | null) => void
  autoFocusTitle?: boolean
  onRemove?: () => void
  /** Picks a block type and appends it to this strand. */
  onAddBlock?: (typeKey: string) => void
  /** The types to choose from -- the same list the day's picker offers. */
  types?: ModuleTypeDto[]
}

export function TrackColumn({
  cluster,
  entry,
  index,
  count,
  blockCount,
  chrome,
  editing,
  children,
}: {
  cluster: ClusterDto
  entry: ScheduleEntry
  /** 0-based position among its siblings; shown 1-based. */
  index: number
  count: number
  blockCount: number
  chrome?: RowChrome
  editing?: TrackEditing
  children: ReactNode
}) {
  const t = useTranslations('agenda')
  const locale = useLocale()
  const [picking, setPicking] = useState(false)
  const titleId = `track-title-${cluster.id}`

  return (
    <div
      ref={chrome?.rootRef}
      style={chrome?.style}
      role="group"
      aria-labelledby={titleId}
      data-block-id={cluster.id}
      className={cn(
        catClass(cluster.color ?? 'slate'),
        'group relative flex min-w-0 flex-col',
        chrome?.isDragging && 'opacity-40',
        chrome?.isDropTarget && 'ring-2 ring-[var(--cat-bar)] ring-inset',
      )}
    >
      {chrome?.handle}
      {chrome?.presence ? <PeerMarks peers={chrome.presence} /> : null}

      {/*
        Sticky on a phone, where the columns are stacked and you would otherwise
        lose track of which strand you are scrolling through. On desktop the
        columns stand next to each other and their heads are all in view, so
        nothing sticks -- the same md:relative the section row uses.
      */}
      <div
        className={cn(
          'sticky top-0 z-10 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1',
          'border-l-4 border-[var(--cat-bar)] bg-[var(--cat-bg)] px-3 py-2 md:relative',
        )}
      >
        <ClusterChrome
          titleId={titleId}
          title={cluster.title}
          color={cluster.color}
          level={3}
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
              {t('breakout.trackPosition', { index: index + 1, count })}
              {' · '}
              {formatTime(entry.startMinute, locale)}–{formatTime(entry.endMinute, locale)}
              {' · '}
              {formatDuration(entry.durationMinutes, { spaced: true })}
            </>
          }
          labels={{
            title: t('breakout.trackTitle'),
            color: t('breakout.trackColor'),
            delete: t('breakout.trackDelete', { count: blockCount }),
            deleteLabel: t('breakout.trackDeleteLabel', {
              title: cluster.title,
              count: blockCount,
            }),
            deleteHint: t('breakout.trackDeleteHint', { count: blockCount }),
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        {children}
        {blockCount === 0 && (
          <p className="px-3 py-2 text-[13px] text-[var(--fg-muted)]">{t('breakout.emptyTrack')}</p>
        )}
      </div>

      {editing?.onAddBlock &&
        (picking ? (
          // The same choice the day's picker offers, in the column where the
          // block will land. A button that silently created whichever type came
          // first would be permanent: there is no way to change a block's type
          // afterwards.
          <div className="m-2 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-2">
            <BlockTypeList
              types={editing.types ?? []}
              compact
              onPick={(typeKey) => {
                editing.onAddBlock?.(typeKey)
                setPicking(false)
              }}
              onCancel={() => setPicking(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            // Named after the strand, so three of these buttons on one screen
            // are three different things to a screen reader rather than one
            // repeated.
            aria-label={t('breakout.addBlockToTrack', { title: cluster.title })}
            className="m-2 inline-flex min-h-11 items-center justify-center gap-1 rounded border border-dashed border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--fg-muted)] hover:border-[var(--cat-bar)] hover:text-[var(--fg)]"
          >
            <Plus aria-hidden className="size-4 shrink-0" />
            {t('addBlock')}
          </button>
        ))}
    </div>
  )
}
