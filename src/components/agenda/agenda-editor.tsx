'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems, withGapRows } from '@/features/agenda/flatten'
import { treeKeyboardCoordinateGetter } from '@/features/agenda/keyboard'
import type { AgendaDocument, DocumentStatus } from '@/features/agenda/document'
// Used only to preview a move for the announcement -- it mutates nothing.
import { applyMove } from '@/features/agenda/move'
import {
  getProjection,
  rowsForDrag,
  toProjectionRows,
  type Projection,
} from '@/features/agenda/projection'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { ModuleDetails } from '@/components/inspector/module-details'
import { ClusterRow, EndOfDay, GapRow, HeaderRow, ModuleRow, type RowChrome } from './agenda-rows'
import { BlockPicker } from './block-picker'
import { DragHandle } from './drag-handle'

const INDENT_PX = 28

/**
 * Created once, at module level, and this is load-bearing.
 *
 * `useSensor` memoises on the identity of its options object. Building the
 * coordinate getter inside the component hands it a new function on every
 * render, so the sensor is torn down and re-instantiated mid-drag -- and it
 * takes its document key listener with it. The symptom is bizarre and hard to
 * trace: the drag starts (that is the activator's own handler) and then Space
 * and Escape do nothing at all.
 */
const KEYBOARD_COORDINATES = treeKeyboardCoordinateGetter()

/** Same reason: every one of these objects must keep its identity across renders. */
// A few pixels of slop so a click on a row stays a click, not a one-pixel drag.
const MOUSE_OPTIONS = { activationConstraint: { distance: 6 } }
// Long-press, so the page still scrolls under a finger.
const TOUCH_OPTIONS = { activationConstraint: { delay: 200, tolerance: 8 } }
const KEYBOARD_OPTIONS = { coordinateGetter: KEYBOARD_COORDINATES }

/** dnd-kit keeps its own live region; we keep ours quiet by giving it nothing. */
const SILENT_ANNOUNCEMENTS: Announcements = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
}

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
export function AgendaEditor({ document: agenda }: { document: AgendaDocument }) {
  const doc = agenda.doc
  const [activeId, setActiveId] = useState<string | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const [overId, setOverId] = useState<string | null>(null)
  // Depth changes from the keyboard are counted here rather than expressed as
  // an x coordinate -- see treeKeyboardCoordinateGetter for why.
  const [keyboardIndent, setKeyboardIndent] = useState(0)
  const [isKeyboardDrag, setIsKeyboardDrag] = useState(false)

  const rows = useMemo(() => flattenDay(doc), [doc])
  const schedule = useMemo(
    () => computeSchedule(doc.startMinute, toScheduleItems(rows)),
    [doc.startMinute, rows],
  )
  const rendered = useMemo(() => withGapRows(rows, schedule), [rows, schedule])

  // The list the drag operates on: gaps removed, and a dragged cluster's
  // children taken out so it travels as one unit.
  const dragRows = useMemo(
    () => (activeId ? rowsForDrag(toProjectionRows(rows), activeId) : toProjectionRows(rows)),
    [rows, activeId],
  )

  // The two input methods must not be mixed. During a keyboard drag dnd-kit
  // still reports a horizontal delta -- moving onto a row at a different
  // indentation shifts x by exactly one step -- which would silently add to the
  // indent the user actually asked for.
  const effectiveOffsetX = isKeyboardDrag ? keyboardIndent * INDENT_PX : offsetX

  const projection: Projection | null =
    activeId && overId
      ? getProjection(dragRows, activeId, overId, effectiveOffsetX, INDENT_PX)
      : null

  useEffect(() => {
    if (!activeId || !isKeyboardDrag) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'ArrowLeft') setKeyboardIndent((d) => d - 1)
      else if (event.code === 'ArrowRight') setKeyboardIndent((d) => d + 1)
      else return
      // The projection clamps out-of-range depths anyway; preventing default
      // stops the page scrolling sideways underneath the drag.
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeId, isKeyboardDrag])

  const sortableIds = useMemo(() => dragRows.map((r) => r.id), [dragRows])

  const [dropMessage, setDropMessage] = useState('')
  // Which row has its type-specific fields open. One at a time: several
  // expanded rows turn the agenda back into a wall of forms.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const liveMessage = activeId ? describeProjection(doc, rows, activeId, projection) : dropMessage

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  )

  function handleDragStart(event: DragStartEvent) {
    setDropMessage('')
    setActiveId(String(event.active.id))
    setIsKeyboardDrag(event.activatorEvent instanceof KeyboardEvent)
    setOffsetX(0)
    setKeyboardIndent(0)
    setOverId(String(event.active.id))
  }

  function handleDragMove(event: DragMoveEvent) {
    setOffsetX(event.delta.x)
    if (event.over) setOverId(String(event.over.id))
  }

  function reset() {
    setActiveId(null)
    setOverId(null)
    setOffsetX(0)
    setKeyboardIndent(0)
    setIsKeyboardDrag(false)
  }

  function handleDragEnd() {
    if (activeId && projection?.valid) {
      setDropMessage(
        describeProjection(doc, rows, activeId, projection).replace('landet', 'abgelegt'),
      )
      agenda.move(activeId, projection)
    }
    reset()
  }

  function handleDragCancel() {
    if (activeId) setDropMessage('Verschieben abgebrochen.')
    reset()
  }

  /**
   * Edits land straight on the document.
   *
   * No dialog, no save button, no edit mode -- the agenda has to stay readable
   * while it is being changed. Persistence will replace this local update with
   * an optimistic one over the same shape; the component does not learn about
   * it either way.
   */
  function patchModule(moduleId: string, patch: Partial<(typeof doc)['modules'][number]>) {
    agenda.patchModule(moduleId, {
      title: patch.title,
      durationMinutes: patch.durationMinutes,
      pinnedStartMinute: patch.pinnedStartMinute,
      desc: patch.desc,
    })
  }

  const activeRow = rows.find((r) => r.id === activeId)
  const projectedParent = projection?.parentId ?? null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithinOrClosestCorners}
      // Rows resize during a drag: a description reflows, a cluster collapses.
      // Without Always, dnd-kit keeps aiming at where rows used to be.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      // Deliberately NOT restrictToVerticalAxis: the horizontal delta is what
      // expresses nesting.
      modifiers={[restrictToWindowEdges]}
      // Our own region does the talking -- see LiveRegion below.
      accessibility={{ announcements: SILENT_ANNOUNCEMENTS }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section
        aria-label={`Agenda ${doc.title}`}
        className="gw-agenda"
        // Always present, so anything waiting on a write -- a test, or a person
        // watching the corner of the screen -- has one honest signal instead of
        // guessing from a message that only appears when something is wrong.
        data-save-state={agenda.status.kind}
      >
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
                        chrome={{ ...chrome, isDropTarget: projectedParent === row.id }}
                      />
                    ) : (
                      <ModuleRow
                        module={row.module}
                        type={doc.moduleTypes[row.module.moduleTypeId]}
                        entry={entry}
                        nested={row.depth === 1}
                        chrome={chrome}
                        editing={{
                          expanded: expandedId === row.id,
                          onToggleExpanded: () =>
                            setExpandedId((current) => (current === row.id ? null : row.id)),
                          onTitleChange: (title) => patchModule(row.id, { title }),
                          onDurationChange: (durationMinutes) =>
                            patchModule(row.id, { durationMinutes }),
                          onDescChange: (desc) => patchModule(row.id, { desc }),
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
        <StatusLine status={agenda.status} />
        <LiveRegion message={liveMessage} />
      </section>

      <DragOverlay dropAnimation={null}>
        {activeRow && activeRow.kind !== 'gap' ? (
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
            style={{ marginLeft: projection?.depth === 1 ? INDENT_PX : 0 }}
          >
            <span className="font-semibold">
              {activeRow.kind === 'cluster' ? activeRow.cluster.title : activeRow.module.title}
            </span>
            <span className="tabular text-[13px] text-[var(--fg-muted)]">
              {activeRow.kind === 'cluster'
                ? `${activeRow.childCount} ${activeRow.childCount === 1 ? 'Block' : 'Blöcke'}`
                : formatDuration(activeRow.module.durationMinutes)}
            </span>
          </div>
        ) : null}
      </DragOverlay>
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

/**
 * Rows vary wildly in height -- a one-line break next to a block with a nested
 * bullet list. `closestCenter` mis-targets the tall ones badly, so pointer
 * containment wins where it applies and corners are the fallback.
 */
const pointerWithinOrClosestCorners: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  return within.length > 0 ? within : closestCorners(args)
}

/**
 * Announcements speak the domain, not coordinates. "Item 3 of 12" tells a
 * screen-reader user nothing about whether the agenda still makes sense; the
 * section it landed in and the new start time do.
 *
 * Crucially they describe the PROJECTED result, not the row currently under the
 * cursor. Reading the current structure instead would make the left/right
 * indent gesture completely silent -- and that gesture is the only way to nest
 * a block from the keyboard.
 */
/**
 * Says nothing while things are fine.
 *
 * A permanent "saved" badge trains people to ignore the one place that would
 * tell them something went wrong. Only trouble is worth interrupting for.
 */
function StatusLine({ status }: { status: DocumentStatus }) {
  if (status.kind === 'local' || status.kind === 'saved') return null

  if (status.kind === 'live') {
    // Only when somebody else is here. A permanent "connected" badge is noise
    // that trains people to ignore the one place that would warn them.
    if (status.peers === 0) return null
    return (
      <p className="px-4 py-1 text-[13px] text-[var(--fg-subtle)] md:px-2">
        {status.peers === 1 ? 'Eine weitere Person' : `${status.peers} weitere Personen`} bearbeiten
        diesen Tag.
      </p>
    )
  }

  if (status.kind === 'connecting' || status.kind === 'saving') {
    return (
      <p className="px-4 py-1 text-[13px] text-[var(--fg-subtle)] md:px-2">
        {status.kind === 'connecting' ? 'Verbinde …' : 'Wird gespeichert …'}
      </p>
    )
  }

  return (
    <p
      role="alert"
      className="mx-4 my-2 rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[14px] text-[var(--warn-fg)] md:mx-2"
    >
      {status.message}
    </p>
  )
}

/**
 * Our own live region instead of dnd-kit's announcements.
 *
 * dnd-kit hands announcement callbacks an `over` but no drag delta, so
 * describing the projected depth meant reading a ref written by a *different*
 * callback in the same tick -- and that ordering is not guaranteed. It held in
 * one measurement and broke under Playwright, which is exactly the kind of
 * "works on my machine" a live region must not be built on.
 *
 * Rendering the message makes it a pure function of state, like everything else
 * here: whatever the screen shows, the region says.
 */
function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}

/** Describes where the active row would land, in domain terms. */
function describeProjection(
  doc: DayDoc,
  rows: ReturnType<typeof flattenDay>,
  activeId: string,
  projection: Projection | null,
): string {
  const titleOf = (id: string) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return id
    if (row.kind === 'cluster') return row.cluster.title
    if (row.kind === 'module') return row.module.title
    return id
  }

  if (!projection?.valid) return `${titleOf(activeId)} aufgenommen.`

  const next = applyMove(doc, activeId, projection)
  const nextRows = flattenDay(next)
  const entry = computeSchedule(next.startMinute, toScheduleItems(nextRows)).entries.get(activeId)

  const where =
    projection.parentId !== null ? `in Abschnitt ${titleOf(projection.parentId)}` : 'auf Tagesebene'
  const position = nextRows.findIndex((r) => r.id === activeId) + 1

  return `${titleOf(activeId)} landet ${where}, Position ${position}${
    entry ? `, neue Startzeit ${formatTime(entry.startMinute)}` : ''
  }.`
}
