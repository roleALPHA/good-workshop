import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { assertWorkshopAccess, ForbiddenError, NotFoundError } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { findField, parseSchema, summaryChips } from '@/domain/moduleType/profile'
import { ParticipationBadge } from '@/components/agenda/participation-control'
import { catClass } from '@/lib/category-colors'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import { RichText } from '@/lib/richtext/render'
import { isRichTextValue } from '@/lib/richtext/schema'
import { readSession } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { workshop as workshopTable } from '@/server/db/schema'
import { getLocale, getTranslations } from 'next-intl/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The facilitator's paper copy.
 *
 * Server-rendered, no client JavaScript: whatever comes out of the printer has
 * to match what was on screen, and a hydration pass that reflows the page while
 * the print dialog is open would break exactly that.
 *
 * PDF is the browser's own print-to-PDF. Running headless Chrome in a
 * self-hostable image is a real operational burden for very little gain here.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ workshopId: string; dayId: string }>
  searchParams: Promise<{ notes?: string }>
}) {
  const session = await readSession()
  if (!session) notFound()

  const { workshopId, dayId } = await params
  const { notes } = await searchParams
  const showNotes = notes === '1'
  const [t, tAgenda, locale] = await Promise.all([
    getTranslations('workshop'),
    getTranslations('agenda'),
    getLocale(),
  ])

  const actor = {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    source: 'web' as const,
  }

  let data
  try {
    data = await withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.export')
      const { doc } = await loadDay(tx, access, dayId, locale)
      const meta = await tx
        .select({ title: workshopTable.title })
        .from(workshopTable)
        .where(eq(workshopTable.id, workshopId))
        .limit(1)
      return { doc, title: meta[0]?.title ?? t('untitled') }
    })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound()
    throw error
  }

  const rows = flattenDay(data.doc)
  const schedule = computeSchedule(data.doc.startMinute, toScheduleItems(rows))

  return (
    <main>
      <header data-print-section className="mb-6 border-b border-neutral-300 pb-3">
        <h1 className="text-2xl font-semibold">{data.title}</h1>
        <p className="tabular mt-1 text-neutral-600">
          {[data.doc.title, data.doc.date].filter(Boolean).join(' · ')}
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

          const type = data.doc.moduleTypes[row.module.moduleTypeId]
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
      <p className="mt-6 text-center text-xs text-neutral-500">{ATTRIBUTION_TEXT}</p>
    </main>
  )
}
