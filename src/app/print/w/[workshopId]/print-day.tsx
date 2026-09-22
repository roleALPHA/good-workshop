import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { findField, parseSchema, summaryChips } from '@/domain/moduleType/profile'
import { ParticipationBadge } from '@/components/agenda/participation-control'
import { catClass } from '@/lib/category-colors'
import { RichText } from '@/lib/richtext/render'
import { isRichTextValue } from '@/lib/richtext/schema'
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
        {rows.map((row) => {
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

          const type = doc.moduleTypes[row.module.moduleTypeId]
          const description = isRichTextValue(row.module.desc.description)
            ? row.module.desc.description
            : null
          const facilitatorNotes =
            showNotes && isRichTextValue(row.module.desc.facilitator_notes)
              ? row.module.desc.facilitator_notes
              : null
          // Beside the time, as on screen: the paper copy is what a facilitator
          // holds while running the room, and "plenary or small groups" is what
          // they look up there.
          const groups = parseSchema(type?.jsonSchema)
          const participation = findField(groups, 'participation')
          const info = summaryChips(groups, row.module.desc)

          return (
            <article
              key={row.id}
              data-print-row
              className={`${catClass(type?.color)} mb-3 grid grid-cols-[5rem_minmax(0,1fr)_12rem] gap-3 border-l-4 border-[var(--cat-bar)] pl-3 ${row.depth === 1 ? 'ml-6' : ''}`}
            >
              <div className="tabular">
                <div className="font-medium">
                  {entry.pinned ? '🔒 ' : ''}
                  {formatTime(entry.startMinute, locale)}
                </div>
                <div className="text-sm text-neutral-600">
                  {formatDuration(entry.durationMinutes)}
                </div>
                {participation && (
                  <ParticipationBadge
                    field={participation}
                    value={
                      typeof row.module.desc.participation === 'string'
                        ? row.module.desc.participation
                        : undefined
                    }
                    className="mt-0.5 text-[13px] text-neutral-600"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">
                  {row.module.title}
                  {type && (
                    <span className="ml-2 text-sm font-normal text-neutral-500">{type.name}</span>
                  )}
                </h3>
                {row.module.responsible.length > 0 && (
                  <p className="mt-0.5 text-[14px] text-neutral-700">
                    <span className="font-medium">{tAgenda('responsible.label')}:</span>{' '}
                    {row.module.responsible
                      .map((person) =>
                        person.memberId
                          ? person.name
                          : `${person.name} (${tAgenda('responsible.external')})`,
                      )
                      .join(', ')}
                  </p>
                )}
                {description && <RichText value={description} className="mt-1 text-[15px]" />}
                {facilitatorNotes && (
                  <div className="mt-1 border-l-2 border-neutral-300 pl-2 text-[14px] text-neutral-600">
                    <RichText value={facilitatorNotes} />
                  </div>
                )}
              </div>
              <dl className="min-w-0 space-y-1 text-[12px] text-neutral-600">
                {info.map((item) => (
                  <div key={`${item.key}:${item.text}`} className="break-words">
                    <dt className="inline font-medium text-neutral-700">{item.label}: </dt>
                    <dd className="inline">{item.text}</dd>
                  </div>
                ))}
              </dl>
            </article>
          )
        })}
      </div>

      <p className="tabular mt-6 border-t border-neutral-300 pt-3 text-neutral-600">
        {t('end', { time: formatTime(schedule.dayEndMinute, locale) })}
      </p>
    </section>
  )
}
