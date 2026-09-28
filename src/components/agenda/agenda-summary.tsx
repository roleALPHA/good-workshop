import type { DayDoc } from '@/domain/agenda/types'
import type { Schedule } from '@/domain/schedule/types'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { dayTotals } from '@/features/agenda/totals'
import { useLocale, useTranslations } from 'next-intl'

/**
 * The line facilitators actually check before sending an agenda out. The
 * content-versus-breaks split is why `countsAsContent` is a first-class column
 * on module_type and not a `desc` attribute.
 */
export function AgendaSummary({ doc, schedule }: { doc: DayDoc; schedule: Schedule }) {
  const locale = useLocale()
  const t = useTranslations('agenda')
  const { content, breaks, blocks } = dayTotals(doc, schedule)

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
