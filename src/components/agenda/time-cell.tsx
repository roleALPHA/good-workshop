import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { cn } from '@/lib/cn'
import { DurationInput, PinControl } from './inline-inputs'
import { useLocale, useTranslations } from 'next-intl'

/**
 * When, and how. Start time above, duration below in bold -- the layout of the
 * reference agenda. A derived start is muted; a pinned one gets full contrast
 * and a lock icon, because "this block is nailed to 13:00" must not be
 * conveyed by colour alone.
 *
 * `children` is what makes it a "when and how" cell rather than a clock: the
 * participation format sits here, because that is the other thing a
 * facilitator reads off a row while looking at the time.
 */
export function TimeCell({
  entry,
  showDuration = true,
  className,
  editing,
  children,
}: {
  entry: ScheduleEntry
  showDuration?: boolean
  className?: string
  /**
   * Present only in the editor. Each handler is optional on its own: a cluster
   * header offers a pin but no duration, because its duration is derived from
   * what it contains.
   */
  editing?: {
    onDurationChange?: (minutes: number) => void
    onPinChange?: (minute: number | null) => void
    /** What the block starts at today, which is what pinning adopts. */
    pinnedStartMinute?: number | null
  }
  /** Sits under the time on a wide screen, beside it on a phone. */
  children?: ReactNode
}) {
  const t = useTranslations('agenda')
  const locale = useLocale()
  // Narrowed once, so the JSX below can rely on the handler being there.
  const editable = editing?.onPinChange !== undefined ? editing : null

  return (
    <div
      className={cn(
        // One line on a phone -- vertical space is the scarce resource there.
        // Two lines from md up, matching the reference agenda.
        'tabular flex flex-row items-baseline gap-2 leading-tight md:flex-col md:items-start md:gap-0.5',
        className,
      )}
    >
      {/*
        The lock belongs BESIDE the time, not under it. The cell is a column
        from md up, so a sibling here would be a line of its own -- and a line
        of its own costs every row in the day 26px, which is how an agenda
        stops fitting on a screen.

        A pinned block being edited also shows its start time ONCE, in the
        field that sets it. Printing the derived time next to an input holding
        the same value reads as two different facts and invites the question of
        which one is real.
      */}
      <span className="inline-flex items-center gap-1">
        {!editable || !entry.pinned ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[15px]',
              entry.pinned ? 'font-medium text-[var(--fg)]' : 'text-[var(--fg-muted)]',
            )}
          >
            {entry.pinned && (
              <>
                <Lock aria-hidden className="size-3 shrink-0" />
                <span className="sr-only">{t('pinnedStart')}</span>
              </>
            )}
            {formatTime(entry.startMinute, locale)}
          </span>
        ) : (
          <span className="sr-only">{t('pinnedStart')}</span>
        )}

        {editable?.onPinChange && (
          <PinControl
            pinnedMinute={editable.pinnedStartMinute ?? null}
            derivedMinute={entry.startMinute}
            onCommit={editable.onPinChange}
          />
        )}
      </span>
      {showDuration &&
        (editing?.onDurationChange ? (
          <DurationInput minutes={entry.durationMinutes} onCommit={editing.onDurationChange} />
        ) : (
          <span className="text-[15px] font-semibold text-[var(--fg)]">
            {formatDuration(entry.durationMinutes)}
          </span>
        ))}

      {children}
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
