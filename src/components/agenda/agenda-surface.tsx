'use client'

import { useMemo } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { flattenDay, toScheduleItems, withGapRows } from '@/features/agenda/flatten'
import { useLocalDocument } from '@/features/agenda/use-local-document'
import { useCollabDocument, type CollabTarget } from '@/features/collab/use-collab-document'
import { useMediaQuery } from '@/hooks/use-media-query'
import { AgendaEditor } from './agenda-editor'
import { AgendaTable } from './agenda-table'
import { DayHeader } from './day-header'

/**
 * Picks the reading view or the editor.
 *
 * Everything below 1024px gets the static table: nested drag & drop plus rich
 * text on a 375px screen is a trap, and the reading view is what a facilitator
 * actually uses on the day, standing in a room. The editor is not a feature
 * withheld from phones -- it is the wrong tool for that screen.
 *
 * The first render is always the reading view, on both server and client, so
 * the phone never downloads or boots the editor and the desktop swap happens
 * after hydration rather than as a mismatch.
 */
export function AgendaSurface({
  doc,
  collab,
}: {
  doc: DayDoc
  /** Absent for the public demo and for viewers: edits then stay in the browser. */
  collab?: CollabTarget
}) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const readOnly = useMemo(() => {
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    return { rows: withGapRows(rows, schedule), schedule }
  }, [doc])

  if (!isDesktop) {
    return (
      <>
        <DayHeader doc={doc} schedule={readOnly.schedule} />
        <AgendaTable doc={doc} rows={readOnly.rows} schedule={readOnly.schedule} />
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
