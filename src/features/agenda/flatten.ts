import type { ClusterDto, DayDoc, ModuleDto } from '@/domain/agenda/types'
import type { Schedule, ScheduleItem } from '@/domain/schedule/types'

/**
 * The domain is a tree (day -> cluster? -> module) but the UI is one flat
 * table. Rather than render nested containers, we keep the tree in the data and
 * flatten it for render -- the same trick a file-tree outliner uses.
 *
 * `FlatRow[]` is the single array that drives rendering, drag & drop, keyboard
 * navigation and the schedule walk. Everything downstream is a pure function of
 * it, which is what keeps intermediate drag states derivable instead of stateful.
 */

export type FlatRow =
  | {
      kind: 'cluster'
      id: string
      depth: 0
      parentId: null
      cluster: ClusterDto
      childCount: number
    }
  | {
      kind: 'module'
      id: string
      depth: 0 | 1
      parentId: string | null
      module: ModuleDto
    }
  | {
      /** Derived from the schedule, never persisted, never draggable. */
      kind: 'gap'
      id: string
      depth: 0
      parentId: null
      minutes: number
      beforeRowId: string
    }

export type FlattenUiState = {
  collapsed?: ReadonlySet<string>
}

type DayLevelEntry =
  | { kind: 'cluster'; order: number; cluster: ClusterDto }
  | { kind: 'module'; order: number; module: ModuleDto }

/**
 * Clusters and day-level modules live in two tables but one ordered list, so
 * they are merged here by `order` and tie-broken by id -- exactly the
 * `ORDER BY position, id` the server uses, so client and server agree.
 */
export function flattenDay(doc: DayDoc, ui: FlattenUiState = {}): FlatRow[] {
  const collapsed = ui.collapsed ?? new Set<string>()

  const childrenByCluster = new Map<string, ModuleDto[]>()
  const dayLevel: DayLevelEntry[] = []

  for (const mod of doc.modules) {
    // Parked blocks are in the day but not in its schedule: they keep their
    // type and duration and simply stop counting towards the clock. Excluded
    // HERE rather than in each caller, because every consumer of these rows --
    // the table, the export, the running totals, the print view -- wants the
    // same answer, and one that forgot would silently show a plan that does not
    // add up.
    if (mod.parked) continue

    if (mod.clusterId === null) {
      dayLevel.push({ kind: 'module', order: mod.order, module: mod })
    } else {
      const bucket = childrenByCluster.get(mod.clusterId)
      if (bucket) bucket.push(mod)
      else childrenByCluster.set(mod.clusterId, [mod])
    }
  }

  for (const cluster of doc.clusters) {
    dayLevel.push({ kind: 'cluster', order: cluster.order, cluster })
  }

  dayLevel.sort((a, b) => a.order - b.order || idOf(a).localeCompare(idOf(b)))

  const rows: FlatRow[] = []

  for (const entry of dayLevel) {
    if (entry.kind === 'module') {
      rows.push({
        kind: 'module',
        id: entry.module.id,
        depth: 0,
        parentId: null,
        module: entry.module,
      })
      continue
    }

    const children = (childrenByCluster.get(entry.cluster.id) ?? [])
      .slice()
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

    rows.push({
      kind: 'cluster',
      id: entry.cluster.id,
      depth: 0,
      parentId: null,
      cluster: entry.cluster,
      childCount: children.length,
    })

    if (collapsed.has(entry.cluster.id)) continue

    for (const mod of children) {
      rows.push({
        kind: 'module',
        id: mod.id,
        depth: 1,
        parentId: entry.cluster.id,
        module: mod,
      })
    }
  }

  return rows
}

function idOf(entry: DayLevelEntry): string {
  return entry.kind === 'cluster' ? entry.cluster.id : entry.module.id
}

/**
 * Projects the render list onto the scheduler's input. Collapsed clusters are a
 * *view* concern: their children still consume time, so callers must schedule
 * over an uncollapsed flatten. Passing a collapsed list here would silently
 * shorten the day.
 */
export function toScheduleItems(rows: FlatRow[]): ScheduleItem[] {
  const items: ScheduleItem[] = []
  for (const row of rows) {
    if (row.kind === 'cluster') {
      items.push({
        id: row.id,
        kind: 'cluster',
        clusterId: null,
        durationMinutes: 0,
        pinnedStartMinute: row.cluster.pinnedStartMinute,
      })
    } else if (row.kind === 'module') {
      items.push({
        id: row.id,
        kind: 'module',
        clusterId: row.parentId,
        durationMinutes: row.module.durationMinutes,
        pinnedStartMinute: row.module.pinnedStartMinute,
      })
    }
  }
  return items
}

/**
 * Injects derived gap rows ahead of the blocks that open them, so a pinned
 * block sitting after the running cursor reads as "10 min buffer" instead of an
 * unexplained jump in the time column. Gaps are display-only: not persisted,
 * not draggable, not part of the sortable id list.
 */
export function withGapRows(rows: FlatRow[], schedule: Schedule): FlatRow[] {
  const out: FlatRow[] = []
  for (const row of rows) {
    const conflict = schedule.entries.get(row.id)?.conflict
    if (conflict?.kind === 'gap') {
      out.push({
        kind: 'gap',
        id: `gap-before-${row.id}`,
        depth: 0,
        parentId: null,
        minutes: conflict.minutes,
        beforeRowId: row.id,
      })
    }
    out.push(row)
  }
  return out
}
