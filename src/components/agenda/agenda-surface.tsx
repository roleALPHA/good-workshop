'use client'

import { useMemo } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { flattenDay, toScheduleItems, withGapRows } from '@/features/agenda/flatten'
import { useLocalDocument } from '@/features/agenda/use-local-document'
import { useCollabDocument, type CollabTarget } from '@/features/collab/use-collab-document'
import { useHydrated } from '@/hooks/use-media-query'
import { AgendaEditor } from './agenda-editor'
import { AgendaTable } from './agenda-table'
import { ParkingArea } from './parking'
import { DayHeader } from './day-header'

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
 */
export function AgendaSurface({
  doc,
  collab,
}: {
  doc: DayDoc
  /** Absent for viewers: edits then stay in the browser and go nowhere. */
  collab?: CollabTarget
}) {
  const hydrated = useHydrated()

  const readOnly = useMemo(() => {
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    return { rows: withGapRows(rows, schedule), schedule }
  }, [doc])

  if (!hydrated) {
    return (
      <>
        <DayHeader doc={doc} schedule={readOnly.schedule} />
        <AgendaTable doc={doc} rows={readOnly.rows} schedule={readOnly.schedule} />
        <ParkingArea doc={doc} />
      </>
    )
  }

  return <EditorSurface doc={doc} collab={collab} />
}

/**
 * Picks how changes are shared.
 *
 * Both hooks are called unconditionally -- React allows nothing else -- and the
 * collaboration one connects only when it has a target. Branching on a hook
 * would break the moment a viewer's permissions changed while the page was open.
 */
function EditorSurface({ doc, collab }: { doc: DayDoc; collab?: CollabTarget }) {
  const local = useLocalDocument(doc)
  const shared = useCollabDocument(doc, collab ?? IDLE_TARGET)
  return <AgendaEditor document={collab ? shared : local} />
}

/** A target the provider recognises as "do not connect". */
const IDLE_TARGET: CollabTarget = {
  workshopId: '',
  dayId: '',
  user: { name: '', hue: 0 },
}
