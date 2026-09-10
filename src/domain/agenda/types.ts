import type { CategoryColor } from '@/lib/category-colors'

/**
 * The client-side view of a workshop day. Deliberately a plain DTO: no class,
 * no methods, no derived fields. Start times, cluster durations and totals are
 * all computed by computeSchedule() from this shape -- see
 * src/domain/schedule/computeSchedule.ts for why nothing derived is stored.
 *
 * Ordering uses fractional string keys (`position`) in the database, but those
 * never leave the server: reads project 0-based ordinals. Within a day, clusters
 * and day-level modules share ONE key space, so they sort together by
 * (position, id).
 */

export type ModuleTypeDto = {
  id: string
  key: string
  name: string
  color: CategoryColor
  icon: string
  defaultDurationMinutes: number
  /** false for break / lunch / buffer -- drives the "5h30 content, 1h15 breaks" split. */
  countsAsContent: boolean
  /**
   * The type's own field definitions. Carried on the day document because the
   * fields are edited in the row itself, not in a panel that could fetch them
   * separately -- see the inline-editing rule in docs/konventionen-ui.md.
   */
  jsonSchema?: unknown
}

export type ClusterDto = {
  id: string
  title: string
  /** Optional override; falls back to a neutral band when null. */
  color: CategoryColor | null
  pinnedStartMinute: number | null
  collapsed: boolean
  /** A budget for an "planned 45m, actual 60m" warning. Never affects the schedule. */
  targetDurationMinutes: number | null
  order: number
}

export type ModuleDto = {
  id: string
  /** null => the module hangs directly on the day. */
  clusterId: string | null
  moduleTypeId: string
  title: string
  durationMinutes: number
  pinnedStartMinute: number | null
  /** Type-specific attributes, validated against the module type's JSON Schema. */
  desc: Record<string, unknown>
  order: number
}

export type DayDoc = {
  id: string
  workshopId: string
  title: string
  /** ISO date, or null for templates. */
  date: string | null
  startMinute: number
  targetEndMinute: number | null
  clusters: ClusterDto[]
  modules: ModuleDto[]
  moduleTypes: Record<string, ModuleTypeDto>
}
