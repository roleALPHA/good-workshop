import type { DayDoc } from '@/domain/agenda/types'
import type { ScheduleEntry } from '@/domain/schedule/types'
import type { FlatRow } from '@/features/agenda/flatten'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { findField, parseSchema, summaryChips } from '@/domain/moduleType/profile'
import { isRichTextValue } from '@/lib/richtext/schema'
import { catClass } from '@/lib/category-colors'
import type { Locale } from '@/i18n/config'
import { ParticipationBadge } from '@/components/agenda/participation-control'
import { RichText } from '@/lib/richtext/render'
import { getTranslations } from 'next-intl/server'

/**
 * One block on paper.
 *
 * Its own file because print-day now has two layouts to keep apart -- the day
 * and a breakout's columns -- and a block is the same block in both. `layout`
 * is the only difference: a strand column on A4 is about 5.6cm, which carries a
 * title and a duration and nothing beside them.
 */
export async function PrintBlock({
  row,
  entry,
  doc,
  locale,
  showNotes,
  layout = 'wide',
}: {
  row: Extract<FlatRow, { kind: 'module' }>
  entry: ScheduleEntry
  doc: DayDoc
  locale: Locale
  showNotes: boolean
  layout?: 'wide' | 'narrow'
}) {
  const tAgenda = await getTranslations({ locale, namespace: 'agenda' })
  const type = doc.moduleTypes[row.module.moduleTypeId]
  const description = isRichTextValue(row.module.desc.description)
    ? row.module.desc.description
    : null
  const facilitatorNotes =
    showNotes && isRichTextValue(row.module.desc.facilitator_notes)
      ? row.module.desc.facilitator_notes
      : null
  // Beside the time, as on screen: the paper copy is what a facilitator holds
  // while running the room, and "plenary or small groups" is what they look up
  // there.
  const groups = parseSchema(type?.jsonSchema)
  const participation = findField(groups, 'participation')
  const info = summaryChips(groups, row.module.desc)

  const indent = layout === 'wide' ? (row.depth === 1 ? 'ml-6' : '') : ''

  return (
    <article
      data-print-row
      className={`${catClass(type?.color)} mb-3 gap-3 border-l-4 border-[var(--cat-bar)] pl-3 ${indent} ${
        layout === 'wide' ? 'grid grid-cols-[5rem_minmax(0,1fr)_12rem]' : ''
      }`}
    >
      <div className="tabular">
        <div className="font-medium">
          {entry.pinned ? '🔒 ' : ''}
          {formatTime(entry.startMinute, locale)}
        </div>
        <div className="text-sm text-neutral-600">{formatDuration(entry.durationMinutes)}</div>
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
          {type && <span className="ml-2 text-sm font-normal text-neutral-500">{type.name}</span>}
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
      {/* The info column does not exist in a strand: there is no room for it. */}
      {layout === 'wide' && (
        <dl className="min-w-0 space-y-1 text-[12px] text-neutral-600">
          {info.map((item) => (
            <div key={`${item.key}:${item.text}`} className="break-words">
              <dt className="inline font-medium text-neutral-700">{item.label}: </dt>
              <dd className="inline">{item.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}
