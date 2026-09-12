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
  readOnly = false,
}: {
  doc: DayDoc
  collab?: CollabTarget
  /**
   * Renders the reading view and stops there.
   *
   * Without this, "read-only" was the absence of `collab` -- and the editor
   * mounted anyway, wrote into a local document and threw the changes away on
   * navigation. Somebody was shown fields they could type in, a drag handle that
   * worked, and no hint that none of it was being saved.
   *
   * That was survivable for a colleague who could see the agenda in the library
   * either way. It is not survivable for an invited guest, whose entire view of
   * the workshop is this page. So the reading view -- which already exists for
   * the first paint and for print -- becomes the whole answer when there is no
   * write permission.
   */
  readOnly?: boolean
}) {
  const hydrated = useHydrated()

  // Renamed from `readOnly`, which is now the prop above: the same word for a
  // permission and for a bag of precomputed rows is one shadowing away from a
  // bug that renders an editable page.
  const reading = useMemo(() => {
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    return { rows: withGapRows(rows, schedule), schedule }
  }, [doc])

  // The same branch for both reasons: before hydration because no JavaScript has
  // arrived yet, and for a reader because none is going to help them.
  if (!hydrated || readOnly) {
    return (
      <>
        <DayHeader doc={doc} schedule={reading.schedule} />
        <AgendaTable doc={doc} rows={reading.rows} schedule={reading.schedule} />
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
