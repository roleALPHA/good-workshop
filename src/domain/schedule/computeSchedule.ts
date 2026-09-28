import { buildTree, type ScheduleTree } from './tree'
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
 * @param items          flattened day order: a container immediately followed
 *                       by its children, day-level modules interleaved by position
 */
export function computeSchedule(dayStartMinute: number, items: ScheduleItem[]): Schedule {
  const entries = new Map<string, ScheduleEntry>()
  const tree = buildTree(items)
  const ctx: Ctx = { ...tree, dayStartMinute, entries }
  const day = sequential(tree.roots, ctx, dayStartMinute)

  // Only here, in one pass: which strand of a breakout counts is not settled
  // until every strand has been laid on the clock.
  for (const id of day.countedIds) {
    const entry = entries.get(id)
    if (entry) entry.countsTowardsTotals = true
  }

  return {
    entries,
    dayStartMinute,
    dayEndMinute: day.cursor,
    totalDurationMinutes: day.countedMinutes,
  }
}

type Ctx = ScheduleTree & { dayStartMinute: number; entries: Map<string, ScheduleEntry> }

/**
 * What a group of siblings did to the clock.
 *
 * `cursor` and `end` are deliberately two things and not one. `cursor` is
 * "where the running clock now stands", `end` is "how far this group reaches".
 * An internal overlap -- a block pinned earlier than the previous one ends --
 * pulls them apart, and that is exactly how this function behaved before: the
 * next day-level block carried on at the cursor while the section reached to
 * its latest child.
 */
type Span = {
  cursor: number
  start: number
  end: number
  countedMinutes: number
  countedIds: string[]
}

/** One after another: the cursor runs through the children. */
function sequential(children: ScheduleItem[], ctx: Ctx, from: number): Span {
  let cursor = from
  let start = from
  let end = from
  let countedMinutes = 0
  const countedIds: string[] = []
  let first = true

  for (const child of children) {
    const span = place(child, ctx, cursor)
    // The start is the FIRST child's, even when that child carries its own pin;
    // the end is the latest of all of them. Both as before.
    if (first) {
      start = span.start
      end = span.end
      first = false
    } else {
      end = Math.max(end, span.end)
    }
    cursor = span.cursor
    countedMinutes += span.countedMinutes
    countedIds.push(...span.countedIds)
  }

  return { cursor, start, end, countedMinutes, countedIds }
}

/**
 * At the same time: every strand begins where the container begins, the
 * container ends when the last strand does, and the clock jumps there.
 *
 * Two things are expressly NOT conflicts here: that two strands overlap (that
 * is the point), and that one finishes earlier than another (groups differ). A
 * conflict only arises inside a strand, against that strand's own clock, which
 * starts at the container's start. A strand with its own pin wins against that
 * start and is charged the difference as a gap or an overlap, exactly like a
 * block in the same position.
 */
function parallel(children: ScheduleItem[], ctx: Ctx, from: number): Span {
  if (children.length === 0) {
    return { cursor: from, start: from, end: from, countedMinutes: 0, countedIds: [] }
  }

  const spans = children.map((child) => place(child, ctx, from))
  const start = Math.min(...spans.map((s) => s.start))
  const end = Math.max(...spans.map((s) => s.end))

  // ONE strand counts towards the day's totals: the one that ends last.
  //
  // Not all of them: then "09:00 to 17:00" would say eight hours while
  // "content plus breaks" said fourteen, and the line facilitators check
  // before sending the agenda out would be wrong. Not none: then the
  // section's time would be missing from the split entirely. The last to
  // finish, because precisely its blocks line the interval the section
  // occupies on the clock -- so "content plus breaks plus gaps = end minus
  // start" keeps holding word for word across a breakout. On a tie the first
  // in document order, so the number does not jump when columns are reordered.
  //
  // The price, said plainly: a break that exists only in a shorter strand does
  // not appear in the day's break total. It stands in its column, with its
  // time, and the section's wall clock is right.
  let winner = spans[0]!
  for (const span of spans) if (span.end > winner.end) winner = span

  return {
    cursor: end,
    start,
    end,
    countedMinutes: winner.countedMinutes,
    countedIds: winner.countedIds,
  }
}

/** Lays one item on the clock and writes its entry. */
function place(item: ScheduleItem, ctx: Ctx, cursor: number): Span {
  const pinned = item.pinnedStartMinute !== null
  const at = pinned ? resolvePin(item.pinnedStartMinute!, ctx.dayStartMinute) : cursor
  const drift = at - cursor

  const inner: Span =
    item.kind === 'module'
      ? {
          cursor: at + item.durationMinutes,
          start: at,
          end: at + item.durationMinutes,
          countedMinutes: item.durationMinutes,
          countedIds: [item.id],
        }
      : item.mode === 'parallel'
        ? parallel(ctx.childrenOf.get(item.id) ?? [], ctx, at)
        : sequential(ctx.childrenOf.get(item.id) ?? [], ctx, at)

  ctx.entries.set(item.id, {
    startMinute: inner.start,
    endMinute: inner.end,
    // A container carries no duration of its own: its is the span it covers,
    // and an empty one stays the zero-length mark at the cursor it always was.
    durationMinutes: item.kind === 'module' ? item.durationMinutes : inner.end - inner.start,
    pinned,
    conflict:
      drift < 0
        ? { kind: 'overlap', minutes: -drift }
        : drift > 0
          ? { kind: 'gap', minutes: drift }
          : null,
    countsTowardsTotals: false,
  })

  return inner
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
