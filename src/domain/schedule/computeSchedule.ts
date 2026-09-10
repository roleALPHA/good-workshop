import { MINUTES_PER_DAY, type Schedule, type ScheduleEntry, type ScheduleItem } from './types'

/**
 * Turns a day's ordered items into start/end times.
 *
 * Start times are NEVER stored. A stored start time would have to be
 * invalidated by: editing any earlier duration, reordering, moving between
 * clusters, deleting, adding, changing the day start, or changing a pin. Every
 * one of those is a full-day rewrite, and any missed path produces a silently
 * wrong agenda -- the single worst failure mode this product can have.
 * Computing over ~50 rows is microseconds.
 *
 * This function is shared verbatim by the editor, the Markdown exporter, the
 * print view and the MCP tools. It has no DB access and no I/O.
 *
 * @param dayStartMinute minute-of-day the day begins (e.g. 540 for 09:00)
 * @param items          flattened day order: a cluster immediately followed by
 *                       its children, day-level modules interleaved by position
 */
export function computeSchedule(dayStartMinute: number, items: ScheduleItem[]): Schedule {
  const entries = new Map<string, ScheduleEntry>()
  let cursor = dayStartMinute
  let totalDurationMinutes = 0

  for (const item of items) {
    const pinned = item.pinnedStartMinute !== null
    const start = pinned ? resolvePin(item.pinnedStartMinute!, dayStartMinute) : cursor
    const drift = start - cursor

    // A cluster contributes no duration of its own; its pin only moves the
    // cursor so the first child lands on the pinned time.
    const duration = item.kind === 'cluster' ? 0 : item.durationMinutes
    const end = start + duration

    entries.set(item.id, {
      startMinute: start,
      endMinute: end,
      durationMinutes: duration,
      pinned,
      conflict:
        drift < 0
          ? { kind: 'overlap', minutes: -drift }
          : drift > 0
            ? { kind: 'gap', minutes: drift }
            : null,
    })

    if (item.kind === 'module') totalDurationMinutes += duration
    cursor = end
  }

  aggregateClusters(items, entries)

  return {
    entries,
    dayStartMinute,
    dayEndMinute: cursor,
    totalDurationMinutes,
  }
}

/**
 * Resolves a pinned wall-clock time to an absolute minute on this day's
 * timeline: the first occurrence at or after the day's start. A pin of 01:00 on
 * a workshop that started at 20:00 therefore means 01:00 *tomorrow*, which is
 * what the facilitator meant.
 *
 * Anchoring to the day start rather than to the running cursor is deliberate:
 * it keeps an overlap (a pin earlier than the cursor) visible as an overlap
 * instead of silently jumping the block a day forward.
 */
function resolvePin(pinnedStartMinute: number, dayStartMinute: number): number {
  const dayBase = Math.floor(dayStartMinute / MINUTES_PER_DAY) * MINUTES_PER_DAY
  let resolved = dayBase + pinnedStartMinute
  while (resolved < dayStartMinute) resolved += MINUTES_PER_DAY
  return resolved
}

/**
 * A cluster's displayed span is its first child's start to its last child's
 * end, so an internal pin that opens a gap is reflected in the cluster total.
 * An empty cluster keeps the zero-length entry it got during the walk.
 */
function aggregateClusters(items: ScheduleItem[], entries: Map<string, ScheduleEntry>): void {
  const seen = new Set<string>()

  for (const item of items) {
    if (item.kind !== 'module' || item.clusterId === null) continue

    const clusterEntry = entries.get(item.clusterId)
    const childEntry = entries.get(item.id)
    if (!clusterEntry || !childEntry) continue

    if (!seen.has(item.clusterId)) {
      seen.add(item.clusterId)
      // The cluster starts where its first child actually starts -- which is
      // not the cursor if that child carries its own pin.
      clusterEntry.startMinute = childEntry.startMinute
      clusterEntry.endMinute = childEntry.endMinute
    } else {
      clusterEntry.endMinute = Math.max(clusterEntry.endMinute, childEntry.endMinute)
    }
    clusterEntry.durationMinutes = clusterEntry.endMinute - clusterEntry.startMinute
  }
}
