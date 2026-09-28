import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { groupBreakouts } from '@/features/agenda/group-rows'
import { PrintBlock } from './print-block'
import { PrintBreakout } from './print-breakout'
import { catClass } from '@/lib/category-colors'
import type { DayDoc } from '@/domain/agenda/types'
import type { Locale } from '@/i18n/config'
import { getTranslations } from 'next-intl/server'

/**
 * One day on paper.
 *
 * Its own component because two routes lay it out: a single day, and every day
 * of a workshop one after another. The heading it carries is the DAY -- the
 * workshop's own title is printed once by whoever is printing, not per day.
 *
 * No client JavaScript here either, for the reason the layout gives: a
 * hydration pass that reflows the page while the print dialog is open is
 * exactly the bug this whole route exists to avoid.
 */
export async function PrintDay({
  doc,
  heading,
  locale,
  showNotes,
  breakBefore = false,
}: {
  doc: DayDoc
  heading: string
  locale: Locale
  showNotes: boolean
  /** Start on a fresh sheet. False for the first day, true for the ones after. */
  breakBefore?: boolean
}) {
  const [t, tAgenda] = await Promise.all([getTranslations('workshop'), getTranslations('agenda')])

  const rows = flattenDay(doc)
  const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))

  return (
    <section style={breakBefore ? { breakBefore: 'page' } : undefined}>
      <header data-print-section className="mb-6 border-b border-neutral-300 pb-3">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="tabular mt-1 text-neutral-600">
          {[doc.title, doc.date].filter(Boolean).join(' · ')}
          {' · '}
          {formatTime(schedule.dayStartMinute, locale)}–{formatTime(schedule.dayEndMinute, locale)}
        </p>
      </header>

      <div>
        <div
          data-print-section
          className="mb-2 grid grid-cols-[5rem_minmax(0,1fr)_12rem] gap-3 border-b border-neutral-300 pb-1 text-[10px] font-medium tracking-wide text-neutral-500 uppercase"
        >
          <span>{tAgenda('columns.time')}</span>
          <span>{tAgenda('columns.titleAndDescription')}</span>
          <span>{tAgenda('columns.info')}</span>
        </div>
        {groupBreakouts(rows).map((node) => {
          if (node.kind === 'breakout') {
            return (
              <PrintBreakout
                key={node.id}
                node={node}
                doc={doc}
                schedule={schedule}
                locale={locale}
                showNotes={showNotes}
              />
            )
          }

          const row = node.row
          const entry = schedule.entries.get(row.id)
          if (!entry) return null

          if (row.kind === 'cluster') {
            return (
              <h2
                key={row.id}
                data-print-section
                className={`${catClass(row.cluster.color ?? 'slate')} mt-5 mb-2 border-l-4 border-[var(--cat-bar)] pl-3 text-lg font-semibold`}
              >
                {row.cluster.title}
                <span className="tabular ml-2 text-sm font-normal text-neutral-600">
                  {formatTime(entry.startMinute, locale)} ·{' '}
                  {formatDuration(entry.durationMinutes, { spaced: true })}
                </span>
              </h2>
            )
          }
          if (row.kind !== 'module') return null

          return (
            <PrintBlock
              key={row.id}
              row={row}
              entry={entry}
              doc={doc}
              locale={locale}
              showNotes={showNotes}
            />
          )
        })}
      </div>

      <p className="tabular mt-6 border-t border-neutral-300 pt-3 text-neutral-600">
        {t('end', { time: formatTime(schedule.dayEndMinute, locale) })}
      </p>
    </section>
  )
}
