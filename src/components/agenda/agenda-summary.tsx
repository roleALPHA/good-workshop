import type { DayDoc } from '@/domain/agenda/types'
import type { Schedule } from '@/domain/schedule/types'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { useLocale, useTranslations } from 'next-intl'

/**
 * The line facilitators actually check before sending an agenda out. The
 * content-versus-breaks split is why `countsAsContent` is a first-class column
 * on module_type and not a `desc` attribute.
 */
export function AgendaSummary({ doc, schedule }: { doc: DayDoc; schedule: Schedule }) {
  const locale = useLocale()
  const t = useTranslations('agenda')
  let content = 0
  let breaks = 0

  for (const mod of doc.modules) {
    const type = doc.moduleTypes[mod.moduleTypeId]
    if (type?.countsAsContent === false) breaks += mod.durationMinutes
    else content += mod.durationMinutes
  }

  const blocks = doc.modules.length

  return (
    <p className="tabular text-[15px] text-[var(--fg-muted)]">
      <span className="font-medium text-[var(--fg)]">
        {formatTime(schedule.dayStartMinute, locale)} – {formatTime(schedule.dayEndMinute, locale)}
      </span>
      {' · '}
      {t('content', { duration: formatDuration(content, { spaced: true }) })}
      {' · '}
      {t('breaks', { duration: formatDuration(breaks, { spaced: true }) })}
      {' · '}
      {t('blockCount', { count: blocks })}
    </p>
  )
}
