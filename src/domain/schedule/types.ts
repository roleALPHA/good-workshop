/**
 * Everything in the scheduler is integer minutes since the day's reference
 * midnight -- never a Date. Two consequences we want:
 *
 *  - `end > 1440` falls out naturally for evening sessions that run past
 *    midnight, and renders as "01:30 (+1)".
 *  - Wall-clock stays wall-clock. A workshop on a spring-forward Sunday still
 *    reads 09:00 -> 17:00 as the facilitator wrote it. Conversion to absolute
 *    instants happens only at the edge (a future ICS export), where it belongs.
 */
export const MINUTES_PER_DAY = 1440

export type ScheduleItemKind = 'cluster' | 'module'

/** How a container lays its children onto the clock. */
export type ScheduleMode = 'sequential' | 'parallel'

export type ScheduleItem = {
  id: string
  kind: ScheduleItemKind
  /**
   * The container this sits in: for a block its cluster, for a strand the
   * breakout it runs in. Null at day level.
   *
   * Still called clusterId, because the parent of everything here is always a
   * cluster row -- and because the eighteen tests of this function spell it
   * that way. One word is not worth a broken contract.
   */
  clusterId: string | null
  /** Clusters carry no duration of their own -- theirs is derived. */
  durationMinutes: number
  /** Minute-of-day 0..1439 when the block is pinned ("lock" icon), else null. */
  pinnedStartMinute: number | null
  /**
   * Clusters only. Absent means 'sequential' -- every cluster that existed
   * before breakouts, and the reason no caller had to be touched.
   */
  mode?: ScheduleMode
}

export type ScheduleConflict =
  { kind: 'overlap'; minutes: number } | { kind: 'gap'; minutes: number }

export type ScheduleEntry = {
  startMinute: number
  endMinute: number
  durationMinutes: number
  pinned: boolean
  /**
   * Surfaced, never auto-resolved. An overlap is a *valid* intermediate state:
   * the facilitator is mid-edit and will trim something. Silently shortening a
   * block destroys trust in the tool.
   */
  conflict: ScheduleConflict | null
  /**
   * Whether this block's minutes count towards the day's totals.
   *
   * False for every block in a breakout strand except the one strand that sets
   * the section's wall clock -- otherwise "09:00 to 17:00" would say eight
   * hours while "content plus breaks" said fourteen, and that line is the one
   * facilitators check before sending the agenda out.
   *
   * Meant for blocks; on a container it is always false, because a container
   * never has minutes of its own.
   */
  countsTowardsTotals: boolean
}

export type Schedule = {
  entries: Map<string, ScheduleEntry>
  dayStartMinute: number
  dayEndMinute: number
  /**
   * Sum of the block durations that count towards the day -- no gaps, no
   * parked blocks, and out of a breakout only the strand that sets the clock.
   */
  totalDurationMinutes: number
}
