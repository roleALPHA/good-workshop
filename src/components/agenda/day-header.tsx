import { DayNote } from './day-note'
import type { DayDoc } from '@/domain/agenda/types'
import type { Schedule } from '@/domain/schedule/types'
import { AgendaSummary } from './agenda-summary'
import { CategoryLegend } from './category-legend'

/**
 * The running totals and the legend for one day.
 *
 * Rendered from the SAME document the table below it is rendered from, which
 * is the whole point of it living here. Both used to sit in the page, derived
 * from the server-rendered day -- so after the first edit the heading said
 * "0m content · 0 blocks" above three visible blocks. A summary that disagrees
 * with the list under it is worse than no summary.
 */
export function DayHeader({
  doc,
  schedule,
  onDescChange,
}: {
  doc: DayDoc
  schedule: Schedule
  /** Absent for readers, who see the note but cannot change it. */
  onDescChange?: (desc: Record<string, unknown>) => void
}) {
  return (
    <div className="mb-4 px-4 md:px-2">
      <AgendaSummary doc={doc} schedule={schedule} />
      <DayNote doc={doc} onChange={onDescChange} />
      <div className="mt-3">
        <CategoryLegend doc={doc} />
      </div>
    </div>
  )
}
