'use client'

import { Inbox, Undo2 } from 'lucide-react'
import type { DayDoc } from '@/domain/agenda/types'
import { formatDuration } from '@/features/agenda/duration'
import { useTranslations } from 'next-intl'

/**
 * The blocks set aside: in the day, out of the schedule.
 *
 * Until now the only way to take a block out of a plan was to delete it -- so
 * the one you prepared and did not use, the one that got cut for time, the
 * alternative you want within reach, all had to be either in the running order
 * or gone. Parking keeps them with the day, with their type, duration and
 * description intact, and counts none of it towards the clock.
 *
 * Rendered below the agenda rather than beside it: it is a shelf, not a second
 * column, and a phone has no room for a second column anyway.
 */
export function ParkingArea({
  doc,
  onUnpark,
}: {
  doc: DayDoc
  /** Absent for readers, who see the shelf but cannot move anything off it. */
  onUnpark?: (moduleId: string) => void
}) {
  const t = useTranslations('agenda')
  const parked = doc.modules.filter((mod) => mod.parked)
  if (parked.length === 0) return null

  return (
    <section aria-labelledby="parking-heading" className="mt-8 px-4 md:px-2">
      <h2
        id="parking-heading"
        className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase"
      >
        <Inbox aria-hidden className="size-3.5" />
        {t('parkedHeading', { count: parked.length })}
      </h2>
      <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">{t('parkedHint')}</p>

      <ul className="mt-2 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
        {parked.map((mod) => (
          <li
            key={mod.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
            // Named like a row in the agenda, so the same query finds it.
            role="article"
            aria-label={mod.title}
          >
            <span className="min-w-0 flex-1 truncate text-[15px]">{mod.title}</span>
            <span className="tabular shrink-0 text-[14px] text-[var(--fg-muted)]">
              {formatDuration(mod.durationMinutes)}
            </span>
            {onUnpark && (
              <button
                type="button"
                onClick={() => onUnpark(mod.id)}
                aria-label={t('unparkLabel', { title: mod.title })}
                className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
              >
                <Undo2 aria-hidden className="size-3.5" />
                {t('unpark')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
