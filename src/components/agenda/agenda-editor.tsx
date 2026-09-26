'use client'

import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslations } from 'next-intl'
import type { AssignablePerson } from '@/domain/agenda/responsible'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems, withGapRows } from '@/features/agenda/flatten'
import type { AgendaDocument, Peer } from '@/features/agenda/document'
import type { ParkedElsewhere } from '@/features/agenda/days'
import { useAgendaDrag } from '@/features/agenda/use-agenda-drag'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { ModuleDetails } from '@/components/inspector/module-details'
import { agendaCollisionDetection, INDENT_PX, SILENT_ANNOUNCEMENTS } from './agenda-dnd'
import { EndOfDay, GapRow, HeaderRow, type RowChrome } from './agenda-rows'
import { ClusterRow } from './cluster-row'
import { ModuleRow } from './module-row'
import { BlockPicker } from './block-picker'
import { DayHeader } from './day-header'
import { DragHandle } from './drag-handle'
import { LiveRegion } from './live-region'
import { ParkingArea } from './parking'
import { PresenceBar } from './presence'
import { SaveStatus } from './save-status'

/**
 * The interactive agenda.
 *
 * State lives here and nowhere else for now: there is no server yet, so a drag
 * is applied straight to a local DayDoc. When persistence lands this becomes an
 * Where those changes go is not this component's business: the public demo
 * keeps them in React state, a signed-in editor writes them into a shared
 * document other people are watching. Both arrive here as the same
 * AgendaDocument.
 *
 * Times are never stored, so nothing has to be recomputed after a move: the
 * schedule is derived from the new document on the next render, for free.
 */
export function AgendaEditor({
  document: agenda,
  elsewhere,
  onBringHere,
  parkingError,
  people,
}: {
  document: AgendaDocument
  /** Members who can be put in charge of a block. Absent for a guest. */
  people?: AssignablePerson[]
  /** What is parked on the other days of the workshop. */
  elsewhere?: ParkedElsewhere[]
  /** Brings one of those into this day. Absent for anyone who cannot reach another day. */
  onBringHere?: (block: ParkedElsewhere) => void
  parkingError?: string | null
}) {
  const t = useTranslations('agenda')
  const doc = agenda.doc
  const rows = useMemo(() => flattenDay(doc), [doc])
  const schedule = useMemo(
    () => computeSchedule(doc.startMinute, toScheduleItems(rows)),
    [doc.startMinute, rows],
  )
  const rendered = useMemo(() => withGapRows(rows, schedule), [rows, schedule])

  // Which row has its type-specific fields open. One at a time: several
  // expanded rows turn the agenda back into a wall of forms.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // The section added a moment ago, so its name can take the cursor. Only ever
  // set by the button that creates one, and cleared as soon as focus lands.
  const [newSectionId, setNewSectionId] = useState<string | null>(null)

  const { activeId, projection, sortableIds, sensors, liveMessage, handlers } = useAgendaDrag({
    doc,
    rows,
    onMove: (id, where) => agenda.move(id, where),
  })

  /**
   * Edits land straight on the document.
   *
   * No dialog, no save button, no edit mode -- the agenda has to stay readable
   * while it is being changed. Persistence will replace this local update with
   * an optimistic one over the same shape; the component does not learn about
   * it either way.
   */
  function patchModule(moduleId: string, patch: Partial<(typeof doc)['modules'][number]>) {
    // Listed field by field rather than spread: undefined means "not part of
    // this change", and passing the whole object through would let a caller's
    // missing key clear a field it never mentioned.
    agenda.patchModule(moduleId, {
      title: patch.title,
      durationMinutes: patch.durationMinutes,
      pinnedStartMinute: patch.pinnedStartMinute,
      desc: patch.desc,
      parked: patch.parked,
      responsible: patch.responsible,
    })
  }

  const activeRow = rows.find((r) => r.id === activeId)
  const projectedParent = projection?.parentId ?? null

  // Grouped once per render rather than filtered per row: a day is tens of
  // rows and a room is a handful of people, but the nested scan is the kind of
  // thing that quietly becomes the reason a drag stutters.
  const presenceByBlock = useMemo(() => {
    const out = new Map<string, Peer[]>()
    for (const peer of agenda.peers) {
      if (!peer.focusedBlockId) continue
      const bucket = out.get(peer.focusedBlockId)
      if (bucket) bucket.push(peer)
      else out.set(peer.focusedBlockId, [peer])
    }
    return out
  }, [agenda.peers])

  /**
   * One handler for the whole table instead of props on every input.
   *
   * Focus is reported from where it actually happens -- the field somebody is
   * typing in -- and the row is read off the DOM. Threading a callback through
   * every input would mean each new field has to remember to opt in, and the
   * one that forgot would be invisible to everyone else.
   */
  const reportFocus = (event: React.FocusEvent<HTMLElement>) => {
    const row = (event.target as HTMLElement).closest('[data-block-id]')
    const id = row?.getAttribute('data-block-id') ?? null
    agenda.setFocus(id)
    // Spent the moment the cursor arrives. Left standing, a remount during a
    // later drag would yank the focus back into a name nobody is editing.
    if (id !== null && id === newSectionId) setNewSectionId(null)
  }

  const clearFocus = (event: React.FocusEvent<HTMLElement>) => {
    // Only when focus left the table altogether: moving between two fields of
    // the same row would otherwise blink the mark off and on.
    if (event.currentTarget.contains(event.relatedTarget)) return
    agenda.setFocus(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={agendaCollisionDetection}
      // Rows resize during a drag: a description reflows, a cluster collapses.
      // Without Always, dnd-kit keeps aiming at where rows used to be.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      // Deliberately NOT restrictToVerticalAxis: the horizontal delta is what
      // expresses nesting.
      modifiers={[restrictToWindowEdges]}
      // Our own region does the talking -- see LiveRegion below.
      accessibility={{ announcements: SILENT_ANNOUNCEMENTS }}
      {...handlers}
    >
      <section
        aria-label={t('regionLabel', { title: doc.title })}
        className="gw-agenda"
        // Always present, so anything waiting on a write -- a test, or a person
        // watching the corner of the screen -- has one honest signal instead of
        // guessing from a message that only appears when something is wrong.
        data-save-state={agenda.status.kind}
        onFocusCapture={reportFocus}
        onBlurCapture={clearFocus}
      >
        <DayHeader
          doc={doc}
          schedule={schedule}
          onDescChange={(desc) => agenda.patchDay({ desc })}
        />
        <PresenceBar peers={agenda.peers} />
        <HeaderRow />

        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="border-t border-[var(--border)] md:border-t-0">
            {rendered.map((row) => {
              if (row.kind === 'gap') return <GapRow key={row.id} minutes={row.minutes} />

              const entry = schedule.entries.get(row.id)
              if (!entry) return null

              // A dragged cluster's children are hidden for the duration of the
              // drag; they are travelling with it.
              if (activeId && row.kind === 'module' && row.parentId === activeId) return null

              return (
                <SortableRow
                  key={row.id}
                  id={row.id}
                  label={row.kind === 'cluster' ? row.cluster.title : row.module.title}
                  nested={row.kind === 'module' && row.depth === 1}
                >
                  {(chrome) =>
                    row.kind === 'cluster' ? (
                      <ClusterRow
                        cluster={row.cluster}
                        entry={entry}
                        childCount={row.childCount}
                        chrome={{
                          ...chrome,
                          isDropTarget: projectedParent === row.id,
                          presence: presenceByBlock.get(row.id),
                        }}
                        editing={{
                          onPinChange: (pinnedStartMinute) =>
                            agenda.patchCluster(row.id, { pinnedStartMinute }),
                          onTitleChange: (title) => agenda.patchCluster(row.id, { title }),
                          onColorChange: (color) => agenda.patchCluster(row.id, { color }),
                          autoFocusTitle: row.id === newSectionId,
                          // The same op the MCP tool uses: it takes the blocks
                          // inside with it, which is what removing a section
                          // means.
                          onRemove: () => agenda.removeModule(row.id),
                        }}
                      />
                    ) : (
                      <ModuleRow
                        module={row.module}
                        type={doc.moduleTypes[row.module.moduleTypeId]}
                        entry={entry}
                        nested={row.depth === 1}
                        people={people}
                        chrome={{ ...chrome, presence: presenceByBlock.get(row.id) }}
                        editing={{
                          onResponsibleChange: (responsible) =>
                            patchModule(row.id, { responsible }),
                          expanded: expandedId === row.id,
                          onToggleExpanded: () =>
                            setExpandedId((current) => (current === row.id ? null : row.id)),
                          onTitleChange: (title) => patchModule(row.id, { title }),
                          onDurationChange: (durationMinutes) =>
                            patchModule(row.id, { durationMinutes }),
                          onDescChange: (desc) => patchModule(row.id, { desc }),
                          onPinChange: (pinnedStartMinute) =>
                            patchModule(row.id, { pinnedStartMinute }),
                          onPark: () => patchModule(row.id, { parked: true }),
                          onRemove: () => agenda.removeModule(row.id),
                          details: (
                            <ModuleDetails
                              module={row.module}
                              type={doc.moduleTypes[row.module.moduleTypeId]}
                              onChange={(desc) => patchModule(row.id, { desc })}
                            />
                          ),
                        }}
                      />
                    )
                  }
                </SortableRow>
              )
            })}
          </div>
        </SortableContext>

        <BlockPicker
          types={Object.values(doc.moduleTypes)}
          onAddSection={() => setNewSectionId(agenda.addCluster({ title: t('section.newTitle') }))}
          onAdd={(typeKey) => {
            const type = Object.values(doc.moduleTypes).find((t) => t.key === typeKey)
            if (!type) return
            agenda.addModule({
              moduleTypeId: type.id,
              title: type.name,
              durationMinutes: type.defaultDurationMinutes,
            })
          }}
        />

        <EndOfDay schedule={schedule} targetEndMinute={doc.targetEndMinute} />
        <SaveStatus status={agenda.status} />
        <LiveRegion message={liveMessage} />
      </section>

      {/* `pointerEvents: 'none'` for the same reason the library's overlay has
          it: a ghost of what you are carrying must never be a target. Here it is
          a guard rather than a fix -- `dropAnimation={null}` unmounts the
          overlay the moment the pointer is released, so there is no window in
          which it could swallow a press. Enabling a drop animation without this
          would open one. */}
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {activeRow && activeRow.kind !== 'gap' ? (
          // This wrapper keeps the dragged row's exact box, and that is not
          // cosmetic: dnd-kit measures the overlay's only element child
          // (getMeasurableNode) and uses that rect for collision detection.
          // With no pointer to fall back on, a keyboard drag is decided by that
          // rect alone -- and a chip shorter than the row, or nudged sideways
          // by the indent, keeps colliding with the row it just left. So the
          // indent is padding inside the box rather than a margin around it.
          <div
            className="h-full w-full"
            style={{ paddingLeft: projection?.depth === 1 ? INDENT_PX : 0 }}
          >
            <div
              className={cn(
                catClass(
                  activeRow.kind === 'cluster'
                    ? (activeRow.cluster.color ?? 'slate')
                    : doc.moduleTypes[activeRow.module.moduleTypeId]?.color,
                ),
                'flex items-baseline gap-2 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 shadow-lg',
                'border-l-4 border-l-[var(--cat-bar)]',
              )}
            >
              <span className="font-semibold">
                {activeRow.kind === 'cluster' ? activeRow.cluster.title : activeRow.module.title}
              </span>
              <span className="tabular text-[13px] text-[var(--fg-muted)]">
                {activeRow.kind === 'cluster'
                  ? t('blockCount', { count: activeRow.childCount })
                  : formatDuration(activeRow.module.durationMinutes)}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>

      {/* Below the agenda, outside the sortable tree: parked blocks have no
          place in the running order, which is the whole point of them. */}
      <ParkingArea
        doc={doc}
        elsewhere={elsewhere}
        onUnpark={(id) => agenda.patchModule(id, { parked: false })}
        onBringHere={onBringHere}
        error={parkingError}
      />
    </DndContext>
  )
}

function SortableRow({
  id,
  label,
  nested,
  children,
}: {
  id: string
  /** The row's own title -- a screen reader hearing "m-3 verschieben" learns nothing. */
  label: string
  nested: boolean
  children: (chrome: RowChrome) => React.ReactNode
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
