import type { DayDoc } from '@/domain/agenda/types'
import type { Schedule } from '@/domain/schedule/types'

/**
 * The line facilitators check before sending an agenda out: how much of the day
 * is content, how much is breaks, how many blocks there are.
 *
 * Counted off the SCHEDULE rather than off `doc.modules`, and that fixes two
 * things at once. A parked block has no entry, so it stops being counted into a
 * day it is not part of -- which it silently was. And out of a breakout only
 * the strand that sets the wall clock counts, so "content plus breaks" keeps
 * adding up to "end minus start" instead of claiming three hours in a
 * one-hour section.
 */
export type DayTotals = { content: number; breaks: number; blocks: number }

export function dayTotals(doc: DayDoc, schedule: Schedule): DayTotals {
  let content = 0
  let breaks = 0
  let blocks = 0

  for (const mod of doc.modules) {
    const entry = schedule.entries.get(mod.id)
    if (!entry?.countsTowardsTotals) continue

    blocks += 1
    const type = doc.moduleTypes[mod.moduleTypeId]
    if (type?.countsAsContent === false) breaks += mod.durationMinutes
    else content += mod.durationMinutes
  }

  return { content, breaks, blocks }
}
