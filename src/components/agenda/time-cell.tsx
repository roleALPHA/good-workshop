import { Lock } from 'lucide-react'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { cn } from '@/lib/cn'
import { DurationInput } from './inline-inputs'
import { useTranslations } from 'next-intl'

/**
 * Start time above, duration below in bold -- the layout of the reference
 * agenda. A derived start is muted; a pinned one gets full contrast and a lock
 * icon, because "this block is nailed to 13:00" must not be conveyed by colour
 * alone.
 */
export function TimeCell({
  entry,
  showDuration = true,
  className,
  editing,
}: {
  entry: ScheduleEntry
  showDuration?: boolean
  className?: string
  /** Present only in the editor; the duration then becomes editable in place. */
  editing?: { onDurationChange: (minutes: number) => void }
}) {
  return (
    <div
      className={cn(
        // One line on a phone -- vertical space is the scarce resource there.
        // Two lines from md up, matching the reference agenda.
        'tabular flex flex-row items-baseline gap-2 leading-tight md:flex-col md:items-start md:gap-0.5',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[15px]',
          entry.pinned ? 'font-medium text-[var(--fg)]' : 'text-[var(--fg-muted)]',
        )}
      >
        {entry.pinned && (
          <>
            <Lock aria-hidden className="size-3 shrink-0" />
            <span className="sr-only">Startzeit fixiert:</span>
          </>
        )}
        {formatTime(entry.startMinute)}
      </span>
      {showDuration &&
        (editing ? (
          <DurationInput minutes={entry.durationMinutes} onCommit={editing.onDurationChange} />
        ) : (
          <span className="text-[15px] font-semibold text-[var(--fg)]">
            {formatDuration(entry.durationMinutes)}
          </span>
        ))}
    </div>
  )
}

/**
 * An overlap is a valid intermediate state: the facilitator pinned something
 * and will trim a block above it in a moment. We say so and offer nothing
 * automatic -- silently shortening a block is the fastest way to lose trust.
 */
export function OverlapWarning({ minutes }: { minutes: number }) {
  const t = useTranslations('agenda')
  return (
    <p className="mt-1 inline-flex items-center gap-1 rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-[13px] text-[var(--warn-fg)]">
      <span aria-hidden>!</span>
      {t('overlap', { duration: formatDuration(minutes) })}
    </p>
  )
}
