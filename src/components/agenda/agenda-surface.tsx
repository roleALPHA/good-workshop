'use client'

import { useMemo, useState } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import type { DayNav, ParkedElsewhere } from '@/features/agenda/days'
import { flattenDay, toScheduleItems, withGapRows } from '@/features/agenda/flatten'
import { useLocalDocument } from '@/features/agenda/use-local-document'
import { useCollabDocument, type CollabTarget } from '@/features/collab/use-collab-document'
import { useHydrated } from '@/hooks/use-media-query'
import { bringParkedBlockAction } from '@/server/actions/days'
import { AgendaEditor } from './agenda-editor'
import { AgendaTable } from './agenda-table'
import { ParkingArea } from './parking'
import { DayHeader } from './day-header'
import { DayTabs } from './day-tabs'

/**
 * The reading view first, then the editor.
 *
 * The editor used to mount only from 1024px up, on the grounds that nested drag
 * & drop plus rich text on a 375px screen is the wrong tool for the screen.
 * That held for as long as the row was a wall of text -- but a facilitator
 * standing in a room changes the social form, adds a material and nails a block
 * to a clock time, and all three are now a tap. Being handed a screen that
 * shows those three values and refuses every one of them is worse than a
 * cramped control.
 *
 * So the gate is gone, and what it protected is protected where it belongs:
 * dragging needs a long press rather than a swipe, so the page still scrolls
 * under a finger.
 *
 * The first render is still the reading view, on both server and client. Not a
 * hydration workaround -- it is what makes the agenda readable before any
 * JavaScript has arrived, which matters most on the screen where it arrives
 * last.
 *
 * For a reader it is not the first render but the only one. That view was
 * already here, already complete and already what the print page is built from;
 * it just used to be replaced a moment later by an editor the reader was not
 * allowed to save from. Every control answered and every change was discarded
 * on the next load, which is a worse answer than "no" -- so the reading view
 * now simply stays.
 *
 * The day tabs live here rather than in the page for the same reason the
 * summary does: the open day's name is edited in the shared document, and a tab
 * rendered from the page would keep showing the old one.
 */
export function AgendaSurface({
  doc,
  canEdit,
  collab,
  days,
}: {
  doc: DayDoc
  /**
   * Required rather than defaulted: a permission flag that says yes when
   * nobody set it is the wrong way round, and this is the one place that
   * decides whether an editor exists at all.
   */
  canEdit: boolean
  /** Absent for viewers, who never reach the editor that would use it. */
  collab?: CollabTarget
  /** The other days of the workshop and their parked blocks. Absent outside a workshop. */
  days?: DayNav
}) {
  const hydrated = useHydrated()

  const reading = useMemo(() => {
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    return { rows: withGapRows(rows, schedule), schedule }
  }, [doc])

  // Two different reasons for the same view: nothing has hydrated yet, or
  // nothing ever will because this person may only read. Both hooks above ran
  // either way, so the branch is safe.
  if (!hydrated || !canEdit) {
    return (
      <>
        {days && <DayTabs nav={days} activeTitle={doc.title} activeDate={doc.date} />}
        <DayHeader doc={doc} schedule={reading.schedule} />
        <AgendaTable doc={doc} rows={reading.rows} schedule={reading.schedule} />
        <ParkingArea doc={doc} elsewhere={days?.parkedElsewhere} />
      </>
    )
  }

  return <EditorSurface doc={doc} collab={collab} days={days} />
}

/**
 * Picks how changes are shared.
 *
 * Both hooks are called unconditionally -- React allows nothing else -- and the
 * collaboration one connects only when it has a target. Reached only by someone
 * who may edit; the local document is what keeps the editor usable where no
 * collaboration server exists, which in practice means the tests.
 */
function EditorSurface({
  doc,
  collab,
  days,
}: {
  doc: DayDoc
  collab?: CollabTarget
  days?: DayNav
}) {
  const local = useLocalDocument(doc)
  const shared = useCollabDocument(doc, collab ?? IDLE_TARGET)
  const agenda = collab ? shared : local
  const elsewhere = useParkedElsewhere(days)

  return (
    <>
      {days && (
        <DayTabs
          nav={days}
          activeTitle={agenda.doc.title}
          activeDate={agenda.doc.date}
          onRetitle={(title) => agenda.patchDay({ title })}
          onRedate={(date) => agenda.patchDay({ date })}
        />
      )}
      <AgendaEditor
        document={agenda}
        elsewhere={elsewhere.blocks}
        onBringHere={days?.canManage ? elsewhere.bringHere : undefined}
        parkingError={elsewhere.error}
      />
    </>
  )
}

/**
 * The other days' shelf, and taking a block off it.
 *
 * Optimistic: the block leaves the list at once and arrives in the schedule
 * through the room a moment later, like any other collaborator's edit. When
 * the move is refused it goes back onto the shelf, with the reason.
 */
function useParkedElsewhere(days?: DayNav) {
  const initial = days?.parkedElsewhere ?? NOTHING_PARKED
  const [blocks, setBlocks] = useState(initial)
  const [seen, setSeen] = useState(initial)
  if (initial !== seen) {
    setSeen(initial)
    setBlocks(initial)
  }
  const [error, setError] = useState<string | null>(null)

  const bringHere = (block: ParkedElsewhere) => {
    if (!days) return
    setBlocks((current) => current.filter((b) => b.id !== block.id))
    setError(null)
    void bringParkedBlockAction({
      workshopId: days.workshopId,
      moduleId: block.id,
      fromDayId: block.dayId,
      toDayId: days.activeDayId,
    }).then((result) => {
      if (result.ok) return
      setBlocks((current) => [...current, block])
      setError(result.message)
    })
  }

  return { blocks, bringHere, error }
}

const NOTHING_PARKED: ParkedElsewhere[] = []

/** A target the provider recognises as "do not connect". */
const IDLE_TARGET: CollabTarget = {
  workshopId: '',
  dayId: '',
  user: { name: '', hue: 0 },
}
