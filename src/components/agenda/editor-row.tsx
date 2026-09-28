'use client'

import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import type { ReactNode } from 'react'
import type { AgendaDocument, Peer } from '@/features/agenda/document'
import type { FlatRow } from '@/features/agenda/flatten'
import type { Schedule } from '@/domain/schedule/types'
import type { AssignablePerson } from '@/domain/agenda/responsible'
import { ClusterRow } from './cluster-row'
import { GapRow, type RowChrome } from './agenda-rows'
import { DragHandle } from './drag-handle'
import { ModuleRow } from './module-row'
import { ModuleDetails } from '@/components/inspector/module-details'

/**
 * One editable row, wherever it stands.
 *
 * Pulled out of the editor so a strand column can render the very same row as
 * the day does -- with the same fields, the same delete, the same details
 * panel. A second, column-shaped copy of a block row is how the two quietly
 * drift apart.
 */
export type RowContext = {
  agenda: AgendaDocument
  schedule: Schedule
  people?: AssignablePerson[]
  expandedId: string | null
  onToggleExpanded: (id: string) => void
  /** The container just created, whose name should take the cursor. */
  newClusterId: string | null
  /** Where the current drag would land, for the drop ring. */
  projectedParent: string | null
  presenceByBlock: Map<string, Peer[]>
  /** The row being dragged, whose children are travelling with it. */
  activeId: string | null
  /** Layout for blocks: the day's grid, or a narrow strand column. */
  layout?: 'table' | 'stack'
}

export function EditorRow({ row, ctx }: { row: FlatRow; ctx: RowContext }) {
  if (row.kind === 'gap') return <GapRow minutes={row.minutes} />

  const entry = ctx.schedule.entries.get(row.id)
  if (!entry) return null

  const doc = ctx.agenda.doc
  const patch = (moduleId: string, fields: Partial<(typeof doc)['modules'][number]>) => {
    // Listed field by field rather than spread: undefined means "not part of
    // this change", and passing the whole object through would let a caller's
    // missing key clear a field it never mentioned.
    ctx.agenda.patchModule(moduleId, {
      title: fields.title,
      durationMinutes: fields.durationMinutes,
      pinnedStartMinute: fields.pinnedStartMinute,
      desc: fields.desc,
      parked: fields.parked,
      responsible: fields.responsible,
    })
  }

  return (
    <SortableRow
      id={row.id}
      label={row.kind === 'cluster' ? row.cluster.title : row.module.title}
      nested={row.kind === 'module' && row.depth > 0}
    >
      {(chrome) =>
        row.kind === 'cluster' ? (
          <ClusterRow
            cluster={row.cluster}
            entry={entry}
            childCount={row.childCount}
            chrome={{
              ...chrome,
              isDropTarget: ctx.projectedParent === row.id,
              presence: ctx.presenceByBlock.get(row.id),
            }}
            editing={{
              onPinChange: (pinnedStartMinute) =>
                ctx.agenda.patchCluster(row.id, { pinnedStartMinute }),
              onTitleChange: (title) => ctx.agenda.patchCluster(row.id, { title }),
              onColorChange: (color) => ctx.agenda.patchCluster(row.id, { color }),
              autoFocusTitle: row.id === ctx.newClusterId,
              // The same op the MCP tool uses: it takes the blocks inside with
              // it, which is what removing a section means.
              onRemove: () => ctx.agenda.removeModule(row.id),
            }}
          />
        ) : (
          <ModuleRow
            module={row.module}
            type={doc.moduleTypes[row.module.moduleTypeId]}
            entry={entry}
            nested={row.depth > 0}
            layout={ctx.layout}
            people={ctx.people}
            chrome={{ ...chrome, presence: ctx.presenceByBlock.get(row.id) }}
            editing={{
              onResponsibleChange: (responsible) => patch(row.id, { responsible }),
              expanded: ctx.expandedId === row.id,
              onToggleExpanded: () => ctx.onToggleExpanded(row.id),
              onTitleChange: (title) => patch(row.id, { title }),
              onDurationChange: (durationMinutes) => patch(row.id, { durationMinutes }),
              onDescChange: (desc) => patch(row.id, { desc }),
              onPinChange: (pinnedStartMinute) => patch(row.id, { pinnedStartMinute }),
              onPark: () => patch(row.id, { parked: true }),
              onRemove: () => ctx.agenda.removeModule(row.id),
              details: (
                <ModuleDetails
                  module={row.module}
                  type={doc.moduleTypes[row.module.moduleTypeId]}
                  onChange={(desc) => patch(row.id, { desc })}
                />
              ),
            }}
          />
        )
      }
    </SortableRow>
  )
}

export function SortableRow({
  id,
  label,
  nested,
  children,
}: {
  id: string
  /** The row's own title -- a screen reader hearing "m-3 verschieben" learns nothing. */
  label: string
  nested: boolean
  children: (chrome: RowChrome) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  return children({
    rootRef: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    isDragging,
    handle: (
      <DragHandle attributes={attributes} listeners={listeners} label={label} nested={nested} />
    ),
  })
}
