'use client'

import { Inbox, Undo2 } from 'lucide-react'
import type { DayDoc } from '@/domain/agenda/types'
import type { ParkedElsewhere } from '@/features/agenda/days'
import { formatDuration } from '@/features/agenda/duration'
import { useTranslations } from 'next-intl'

/**
 * The blocks set aside: in the workshop, out of the schedule.
 *
 * Until now the only way to take a block out of a plan was to delete it -- so
 * the one you prepared and did not use, the one that got cut for time, the
 * alternative you want within reach, all had to be either in the running order
 * or gone. Parking keeps them, with their type, duration and description
 * intact, and counts none of it towards the clock.
 *
 * One shelf for the whole workshop, not one per day. A block cut from the first
 * day is exactly the alternative somebody reaches for on the second, so the
 * shelf shows what is parked on every day -- and "back into the schedule" means
 * the day on screen, wherever the block was parked. Where it came from is not
 * shown: on a shelf, it does not matter.
 *
 * Rendered below the agenda rather than beside it: it is a shelf, not a second
 * column, and a phone has no room for a second column anyway.
 */
export function ParkingArea({
  doc,
  elsewhere = [],
  onUnpark,
  onBringHere,
  error,
}: {
  doc: DayDoc
  /** Parked on the other days of the workshop. */
  elsewhere?: ParkedElsewhere[]
  /** Absent for readers, who see the shelf but cannot move anything off it. */
  onUnpark?: (moduleId: string) => void
  /** Absent for anyone who cannot reach another day's room -- readers and guests. */
  onBringHere?: (block: ParkedElsewhere) => void
  /** Why the last block could not be brought over. */
  error?: string | null
}) {
  const t = useTranslations('agenda')
  const parked = doc.modules.filter((mod) => mod.parked)
  const count = parked.length + elsewhere.length
  if (count === 0 && !error) return null

  return (
    <section aria-labelledby="parking-heading" className="mt-8 px-4 md:px-2">
      <h2
        id="parking-heading"
        className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase"
      >
        <Inbox aria-hidden className="size-3.5" />
        {t('parkedHeading', { count })}
      </h2>
      <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">{t('parkedHint')}</p>

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}

      {count > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
          {parked.map((mod) => (
            <ShelfItem
              key={mod.id}
              title={mod.title}
              durationMinutes={mod.durationMinutes}
              onBack={onUnpark && (() => onUnpark(mod.id))}
            />
          ))}
          {elsewhere.map((block) => (
            <ShelfItem
              key={block.id}
              title={block.title}
              durationMinutes={block.durationMinutes}
              onBack={onBringHere && (() => onBringHere(block))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ShelfItem({
  title,
  durationMinutes,
  onBack,
}: {
  title: string
  durationMinutes: number
  onBack?: () => void
}) {
  const t = useTranslations('agenda')
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
      // Named like a row in the agenda, so the same query finds it.
      role="article"
      aria-label={title}
    >
      <span className="min-w-0 flex-1 truncate text-[15px]">{title}</span>
      <span className="tabular shrink-0 text-[14px] text-[var(--fg-muted)]">
        {formatDuration(durationMinutes)}
      </span>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t('unparkLabel', { title })}
          className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] pointer-coarse:min-h-11"
        >
          <Undo2 aria-hidden className="size-3.5" />
          {t('unpark')}
        </button>
      )}
    </li>
  )
}
