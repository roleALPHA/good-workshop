'use client'

import { useMemo } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { flattenDay, toScheduleItems, withGapRows } from '@/features/agenda/flatten'
import type { PersistenceTarget } from '@/features/agenda/use-persistence'
import { useMediaQuery } from '@/hooks/use-media-query'
import { AgendaEditor } from './agenda-editor'
import { AgendaTable } from './agenda-table'

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
  persistence,
}: {
  doc: DayDoc
  /** Absent for the public demo and for viewers: edits then stay local. */
  persistence?: PersistenceTarget
}) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const readOnly = useMemo(() => {
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    return { rows: withGapRows(rows, schedule), schedule }
  }, [doc])

  if (!isDesktop) return <AgendaTable doc={doc} rows={readOnly.rows} schedule={readOnly.schedule} />

  return <AgendaEditor initialDoc={doc} persistence={persistence} />
}
