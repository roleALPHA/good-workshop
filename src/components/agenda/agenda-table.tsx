import type { AssignablePerson } from '@/domain/agenda/responsible'
import type { DayDoc } from '@/domain/agenda/types'
import type { Schedule } from '@/domain/schedule/types'
import type { FlatRow } from '@/features/agenda/flatten'
import { EndOfDay, GapRow, HeaderRow } from './agenda-rows'
import { groupBreakouts, type RenderNode } from '@/features/agenda/group-rows'
import { BreakoutRow } from './breakout-row'
import { ClusterRow } from './cluster-row'
import { TrackColumn } from './track-column'
import { ModuleRow } from './module-row'

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
  people,
}: {
  doc: DayDoc
  rows: FlatRow[]
  schedule: Schedule
  people?: AssignablePerson[]
}) {
  return (
    <section aria-label={`Agenda ${doc.title}`} className="gw-agenda">
      <HeaderRow />

      <div className="border-t border-[var(--border)] md:border-t-0">
        {groupBreakouts(rows).map((node) =>
          node.kind === 'row' ? (
            <ReadRow
              key={node.row.id}
              row={node.row}
              doc={doc}
              schedule={schedule}
              people={people}
            />
          ) : (
            <ReadBreakout key={node.id} node={node} doc={doc} schedule={schedule} people={people} />
          ),
        )}
      </div>

      <EndOfDay schedule={schedule} targetEndMinute={doc.targetEndMinute} />
    </section>
  )
}

/** One row, exactly as the editor draws it, minus every way to change it. */
function ReadRow({
  row,
  doc,
  schedule,
  people,
  layout,
}: {
  row: FlatRow
  doc: DayDoc
  schedule: Schedule
  people?: AssignablePerson[]
  layout?: 'table' | 'stack'
}) {
  if (row.kind === 'gap') return <GapRow minutes={row.minutes} />

  const entry = schedule.entries.get(row.id)
  if (!entry) return null

  return row.kind === 'cluster' ? (
    <ClusterRow cluster={row.cluster} entry={entry} childCount={row.childCount} />
  ) : (
    <ModuleRow
      module={row.module}
      type={doc.moduleTypes[row.module.moduleTypeId]}
      entry={entry}
      nested={row.depth > 0}
      layout={layout}
      people={people}
    />
  )
}

/**
 * A breakout, read-only. The very same components as the editor with `editing`
 * left out -- there is deliberately no second, simpler rendering that could
 * drift away from the one people edit.
 */
function ReadBreakout({
  node,
  doc,
  schedule,
  people,
}: {
  node: Extract<RenderNode, { kind: 'breakout' }>
  doc: DayDoc
  schedule: Schedule
  people?: AssignablePerson[]
}) {
  const entry = schedule.entries.get(node.id)
  if (!entry) return null

  const blockCount = node.strands.reduce(
    (sum, strand) => sum + strand.rows.filter((r) => r.kind === 'module').length,
    0,
  )

  return (
    <BreakoutRow
      cluster={node.cluster}
      entry={entry}
      trackCount={node.strands.length}
      blockCount={blockCount}
    >
      {node.strands.map((strand, index) => {
        const strandEntry = schedule.entries.get(strand.id)
        if (!strandEntry) return null
        return (
          <TrackColumn
            key={strand.id}
            cluster={strand.cluster}
            entry={strandEntry}
            index={index}
            count={node.strands.length}
            blockCount={strand.rows.filter((r) => r.kind === 'module').length}
          >
            {strand.rows.map((row) => (
              <ReadRow
                key={row.id}
                row={row}
                doc={doc}
                schedule={schedule}
                people={people}
                layout="stack"
              />
            ))}
          </TrackColumn>
        )
      })}
    </BreakoutRow>
  )
}
