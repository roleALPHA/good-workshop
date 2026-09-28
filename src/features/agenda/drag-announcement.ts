import type { useTranslations } from 'next-intl'
import type { DayDoc } from '@/domain/agenda/types'
import type { Locale } from '@/i18n/config'
import { formatTime } from './duration'
// Used only to preview a move for the announcement -- it mutates nothing.
import { applyMove } from './move'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { flattenDay, toScheduleItems } from './flatten'
import type { Projection } from './projection'

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
 * Describes where the active row would land, in domain terms.
 *
 * Takes a translator rather than reaching for a hook: this is a plain function
 * called from inside a drag callback, and the sentence it builds is read aloud
 * by a screen reader in the facilitator's own language. docs/ui-conventions.md
 * is explicit that these announcements name the domain -- "Icebreaker on
 * position 3 in section Warm-up" -- and not coordinates, which is why the
 * pieces are separate messages rather than one string with a slot.
 */
export function describeProjection(
  doc: DayDoc,
  rows: ReturnType<typeof flattenDay>,
  activeId: string,
  projection: Projection | null,
  t: ReturnType<typeof useTranslations<'agenda'>>,
  locale: Locale,
  tense: 'landing' | 'dropped' = 'landing',
): string {
  const titleOf = (id: string) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return id
    if (row.kind === 'cluster') return row.cluster.title
    if (row.kind === 'module') return row.module.title
    return id
  }

  if (!projection?.valid) return t('drag.picked', { title: titleOf(activeId) })

  const next = applyMove(doc, activeId, projection)
  const nextRows = flattenDay(next)
  const entry = computeSchedule(next.startMinute, toScheduleItems(nextRows)).entries.get(activeId)

  // Inside a breakout the container alone is not enough: "in section A" says
  // nothing about which of three rooms, and the rooms are the point.
  const parent = projection.parentId
  const parentRow = parent === null ? undefined : nextRows.find((r) => r.id === parent)
  const breakoutId =
    parentRow?.kind === 'cluster' && parentRow.depth === 1 ? parentRow.parentId : null

  const where =
    parent === null
      ? t('drag.atDayLevel')
      : breakoutId !== null
        ? t('drag.inTrack', { track: titleOf(parent), breakout: titleOf(breakoutId) })
        : t('drag.inSection', { title: titleOf(parent) })

  // Counted inside the strand rather than across the day: "position 14" spread
  // over three columns is not information anybody can use. At day level and in
  // an ordinary section it stays flat -- e2e/agenda.spec.ts pins that meaning,
  // and changing it would be a side effect nobody asked for.
  const siblings = parent !== null && breakoutId !== null
  const position = siblings
    ? nextRows.filter((r) => r.parentId === parent).findIndex((r) => r.id === activeId) + 1
    : nextRows.findIndex((r) => r.id === activeId) + 1

  const title = titleOf(activeId)

  if (tense === 'dropped') {
    return entry
      ? t('drag.droppedWithTime', {
          title,
          where,
          position,
          time: formatTime(entry.startMinute, locale),
        })
      : t('drag.dropped', { title, where, position })
  }

  return entry
    ? t('drag.landedWithTime', {
        title,
        where,
        position,
        time: formatTime(entry.startMinute, locale),
      })
    : t('drag.landed', { title, where, position })
}
