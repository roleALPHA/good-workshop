import type { DayDoc } from '@/domain/agenda/types'
import type { Schedule } from '@/domain/schedule/types'
import type { FlatRow } from '@/features/agenda/flatten'
import { ClusterRow, EndOfDay, GapRow, HeaderRow, ModuleRow } from './agenda-rows'

/**
 * The agenda without interaction: server-rendered, no client JS.
 *
 * This is what the print view and the phone reading view use, and what the
 * editor falls back to before hydration. The interactive version lives in
 * agenda-editor.tsx and reuses the very same row components, so the two can
 * never drift apart visually.
 */
export function AgendaTable({
  doc,
  rows,
  schedule,
}: {
  doc: DayDoc
  rows: FlatRow[]
  schedule: Schedule
}) {
  return (
    <section aria-label={`Agenda ${doc.title}`} className="gw-agenda">
      <HeaderRow />

      <div className="border-t border-[var(--border)] md:border-t-0">
        {rows.map((row) => {
          if (row.kind === 'gap') return <GapRow key={row.id} minutes={row.minutes} />

          const entry = schedule.entries.get(row.id)
          if (!entry) return null

          return row.kind === 'cluster' ? (
            <ClusterRow
              key={row.id}
              cluster={row.cluster}
              entry={entry}
              childCount={row.childCount}
            />
          ) : (
            <ModuleRow
              key={row.id}
              module={row.module}
              type={doc.moduleTypes[row.module.moduleTypeId]}
              entry={entry}
              nested={row.depth === 1}
            />
          )
        })}
      </div>

      <EndOfDay schedule={schedule} targetEndMinute={doc.targetEndMinute} />
    </section>
  )
}
