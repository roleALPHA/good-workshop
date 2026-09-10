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

export type ScheduleItem = {
  id: string
  kind: ScheduleItemKind
  /** For modules inside a cluster: that cluster's id. Null at day level. */
  clusterId: string | null
  /** Clusters carry no duration of their own -- theirs is derived. */
  durationMinutes: number
  /** Minute-of-day 0..1439 when the block is pinned ("lock" icon), else null. */
  pinnedStartMinute: number | null
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
}

export type Schedule = {
  entries: Map<string, ScheduleEntry>
  dayStartMinute: number
  dayEndMinute: number
  /** Sum of module durations, excluding gaps. */
  totalDurationMinutes: number
}
