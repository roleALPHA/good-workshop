import { getTranslations } from 'next-intl/server'
import type { DayDoc } from '@/domain/agenda/types'
import type { Schedule } from '@/domain/schedule/types'
import type { RenderNode } from '@/features/agenda/group-rows'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import type { Locale } from '@/i18n/config'
import { PrintBlock } from './print-block'

/**
 * A breakout on paper.
 *
 * Two or three strands print as columns; from four on they print one after
 * another. An A4 text column is about 17cm: three columns of 5.6cm carry a
 * title and a duration, four carry nothing.
 *
 * There is deliberately no `break-inside: avoid` on the breakout as a whole. If
 * it does not fit the page the browser would carry column one onto page two
 * while columns two and three stayed on page one -- a page nobody can read.
 * The STRAND is the indivisible unit instead, and a breakout may break between
 * two of them. That is why every strand heading names its breakout: after a
 * page break, a column on its own has to still say what it belongs to.
 */
export async function PrintBreakout({
  node,
  doc,
  schedule,
  locale,
  showNotes,
}: {
  node: Extract<RenderNode, { kind: 'breakout' }>
  doc: DayDoc
  schedule: Schedule
  locale: Locale
  showNotes: boolean
}) {
  const t = await getTranslations({ locale, namespace: 'agenda' })
  const entry = schedule.entries.get(node.id)
  if (!entry) return null

  const columns = node.strands.length >= 2 && node.strands.length <= 3

  return (
    <section data-print-section>
      <h2
        className={`${catClass(node.cluster.color ?? 'slate')} mt-5 mb-2 border-l-4 border-[var(--cat-bar)] pl-3 text-lg font-semibold`}
      >
        {node.cluster.title}
        <span className="tabular ml-2 text-sm font-normal text-neutral-600">
          {formatTime(entry.startMinute, locale)}–{formatTime(entry.endMinute, locale)} ·{' '}
          {t('breakout.simultaneous', { count: node.strands.length })}
        </span>
      </h2>

      <div
        className="grid gap-4"
        style={
          columns
            ? { gridTemplateColumns: `repeat(${node.strands.length}, minmax(0,1fr))` }
            : undefined
        }
      >
        {node.strands.map((strand, index) => {
          const strandEntry = schedule.entries.get(strand.id)
          if (!strandEntry) return null

          return (
            <div key={strand.id} data-print-section style={{ breakInside: 'avoid' }}>
              <h3
                className={`${catClass(strand.cluster.color ?? 'slate')} mb-2 border-l-4 border-[var(--cat-bar)] pl-3 font-semibold`}
              >
                {/* Self-supporting after a page break: the breakout, then which
                    of its strands this is. */}
                <span className="text-sm font-normal text-neutral-600">
                  {node.cluster.title} ·{' '}
                  {t('breakout.trackPosition', {
                    index: index + 1,
                    count: node.strands.length,
                  })}
                </span>
                <br />
                {strand.cluster.title}
                <span className="tabular ml-2 text-sm font-normal text-neutral-600">
                  {formatTime(strandEntry.startMinute, locale)} ·{' '}
                  {formatDuration(strandEntry.durationMinutes, { spaced: true })}
                </span>
              </h3>

              {strand.rows.map((row) =>
                row.kind === 'module' ? (
                  <PrintBlock
                    key={row.id}
                    row={row}
                    entry={schedule.entries.get(row.id)!}
                    doc={doc}
                    locale={locale}
                    showNotes={showNotes}
                    layout={columns ? 'narrow' : 'wide'}
                  />
                ) : null,
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
