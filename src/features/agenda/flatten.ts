import type { ClusterDto, ClusterMode, DayDoc, ModuleDto } from '@/domain/agenda/types'
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

export type Depth = 0 | 1 | 2

export type FlatClusterRow = {
  kind: 'cluster'
  id: string
  /** 0 for a section on the day, 1 for a strand inside a breakout. */
  depth: 0 | 1
  parentId: string | null
  cluster: ClusterDto
  /** Strands for a breakout, blocks for an ordinary section. */
  childCount: number
  /** Copied off the DTO so the projection only ever has to narrow a FlatRow. */
  mode: ClusterMode
}

export type FlatModuleRow = {
  kind: 'module'
  id: string
  /** 1 inside a section, 2 inside a strand. */
  depth: Depth
  parentId: string | null
  module: ModuleDto
}

export type FlatGapRow = {
  /** Derived from the schedule, never persisted, never draggable. */
  kind: 'gap'
  id: string
  /**
   * Taken from the row the gap stands in front of. Writing 0 here would throw a
   * gap inside a strand out of its column -- it belongs to the run it
   * interrupts, not to the day.
   */
  depth: Depth
  parentId: string | null
  minutes: number
  beforeRowId: string
}

export type FlatRow = FlatClusterRow | FlatModuleRow | FlatGapRow

export type FlattenUiState = {
  collapsed?: ReadonlySet<string>
}

type Entry =
  | { kind: 'cluster'; order: number; cluster: ClusterDto }
  | { kind: 'module'; order: number; module: ModuleDto }

/**
 * Clusters and day-level modules live in two tables but one ordered list, so
 * they are merged here by `order` and tie-broken by id -- exactly the
 * `ORDER BY position, id` the server uses, so client and server agree.
 *
 * The walk is recursive because the shape is: a breakout holds strands, a
 * strand holds blocks. It is not recursive WITHOUT limit -- the database makes
 * a third level of clusters unrepresentable -- but writing the walk generically
 * is shorter than writing two levels out, and it cannot disagree with itself.
 */
export function flattenDay(doc: DayDoc, ui: FlattenUiState = {}): FlatRow[] {
  const collapsed = ui.collapsed ?? new Set<string>()

  const childModules = new Map<string, ModuleDto[]>()
  const childClusters = new Map<string, ClusterDto[]>()
  const dayLevel: Entry[] = []

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
      push(childModules, mod.clusterId, mod)
    }
  }

  const byId = new Map(doc.clusters.map((c) => [c.id, c]))
  for (const cluster of doc.clusters) {
    if (cluster.parentClusterId === null) {
      dayLevel.push({ kind: 'cluster', order: cluster.order, cluster })
    } else if (byId.has(cluster.parentClusterId)) {
      push(childClusters, cluster.parentClusterId, cluster)
    }
    // A strand whose breakout is not on this day drops out with its blocks --
    // the same answer an orphaned module has always got.
  }

  const rows: FlatRow[] = []

  const emit = (entry: Entry, depth: Depth, parentId: string | null): void => {
    if (entry.kind === 'module') {
      rows.push({ kind: 'module', id: entry.module.id, depth, parentId, module: entry.module })
      return
    }

    const cluster = entry.cluster
    // A breakout holds strands; anything else holds blocks. Asking the mode
    // rather than the depth keeps the two questions apart: one is about the
    // shape of the document, the other about where we are in it.
    const children: Entry[] =
      cluster.mode === 'parallel'
        ? (childClusters.get(cluster.id) ?? []).map((c) => ({
            kind: 'cluster' as const,
            order: c.order,
            cluster: c,
          }))
        : (childModules.get(cluster.id) ?? []).map((m) => ({
            kind: 'module' as const,
            order: m.order,
            module: m,
          }))

    rows.push({
      kind: 'cluster',
      id: cluster.id,
      depth: depth === 0 ? 0 : 1,
      parentId,
      cluster,
      childCount: children.length,
      mode: cluster.mode,
    })

    if (collapsed.has(cluster.id)) return
    for (const child of sortEntries(children)) emit(child, (depth + 1) as Depth, cluster.id)
  }

  for (const entry of sortEntries(dayLevel)) emit(entry, 0, null)

  return rows
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(value)
  else map.set(key, [value])
}

function sortEntries(entries: Entry[]): Entry[] {
  return entries.slice().sort((a, b) => a.order - b.order || idOf(a).localeCompare(idOf(b)))
}

function idOf(entry: Entry): string {
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
        // A strand names the breakout it runs in -- without that the scheduler
        // cannot know the two belong together and would lay them end to end.
        clusterId: row.parentId,
        durationMinutes: 0,
        pinnedStartMinute: row.cluster.pinnedStartMinute,
        mode: row.mode,
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
        depth: row.depth,
        parentId: row.parentId,
        minutes: conflict.minutes,
        beforeRowId: row.id,
      })
    }
    out.push(row)
  }
  return out
}
