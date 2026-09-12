import * as Y from 'yjs'
import type { ClusterDto, DayDoc, ModuleDto } from '@/domain/agenda/types'
import { keyBetween, sortByPosition } from '@/domain/agenda/ordering'

/**
 * A workshop day as a CRDT.
 *
 * The shape is chosen so that the things two people do at the same time do not
 * conflict, rather than so that it reads nicely:
 *
 *  - Blocks live in a Y.Map keyed by id, NOT in a Y.Array. An array would make
 *    "insert at index 3" the operation, and two concurrent inserts then fight
 *    over what index 3 means. A map plus an explicit sort key makes both
 *    inserts independent.
 *  - Order is a `position` field inside each block: the same fractional key the
 *    database already uses. A move is one field write on one block, so moving
 *    different blocks never conflicts -- and the value needs no translation
 *    when it is written back to Postgres.
 *  - Every block is its own Y.Map, so editing the title and the duration of the
 *    same block concurrently merges instead of colliding. Last-write-wins per
 *    FIELD is the right granularity here; per block would be too coarse and per
 *    character is only needed inside text.
 *  - Descriptions are Y.XmlFragment, which is what y-prosemirror binds to. That
 *    is the one place character-level merging actually matters.
 */

export const DAY_MAP = 'day'
export const BLOCKS_MAP = 'blocks'

export type BlockKind = 'cluster' | 'module'

/** Fields held as plain values. Descriptions are handled separately. */
export type BlockFields = {
  kind: BlockKind
  position: string
  /** For a module inside a cluster; null at day level. */
  parentId: string | null
  title: string
  /** Modules only. */
  moduleTypeId?: string
  durationMinutes?: number
  pinnedStartMinute?: number | null
  /** Clusters only. */
  color?: string | null
  /** Type-specific attributes that are not rich text. */
  desc?: Record<string, unknown>
  /** Set aside: in the day, out of the schedule. */
  parked?: boolean
}

export function blocksOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(BLOCKS_MAP)
}

export function dayOf(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(DAY_MAP)
}

/**
 * Fills an empty Y.Doc from the relational document.
 *
 * Runs once, when the first client opens a day that has no CRDT state yet.
 * Guarded by a marker rather than by "is it empty": two clients arriving at the
 * same moment would otherwise both seed, and the merge would double every block.
 */
export function seedFromDayDoc(doc: Y.Doc, source: DayDoc): void {
  const day = dayOf(doc)
  if (day.get('seeded') === true) return

  doc.transact(() => {
    day.set('seeded', true)
    day.set('id', source.id)
    day.set('workshopId', source.workshopId)
    day.set('title', source.title)
    day.set('date', source.date)
    day.set('startMinute', source.startMinute)
    day.set('targetEndMinute', source.targetEndMinute)
    day.set('desc', source.desc ?? {})

    const blocks = blocksOf(doc)

    // Ordinals become fractional keys again. The DTO carries ordinals because
    // that is what clients and LLMs can reason about; the CRDT needs the sort
    // key back, because that is what makes a move a single-field write.
    //
    // Real keys, not zero-padded ordinals. A padded number sorts correctly and
    // is not a valid fractional key, so the first append to a seeded day threw
    // instead of adding a block -- the seed has to hand back keys the ordering
    // helpers can keep building on.
    const dayLevel = sortByPosition([
      ...source.clusters.map((c) => ({ id: c.id, position: pad(c.order) })),
      ...source.modules
        .filter((m) => m.clusterId === null)
        .map((m) => ({ id: m.id, position: pad(m.order) })),
    ])
    const dayPositions = keysFor(dayLevel.map((row) => row.id))
    const childPositions = new Map<string, string>()
    for (const cluster of source.clusters) {
      const children = sortByPosition(
        source.modules
          .filter((m) => m.clusterId === cluster.id)
          .map((m) => ({ id: m.id, position: pad(m.order) })),
      ).map((row) => row.id)
      for (const [id, key] of keysFor(children)) childPositions.set(id, key)
    }

    for (const cluster of source.clusters) {
      blocks.set(
        cluster.id,
        newBlock({
          kind: 'cluster',
          position: dayPositions.get(cluster.id) ?? keyBetween(null, null),
          parentId: null,
          title: cluster.title,
          color: cluster.color,
          pinnedStartMinute: cluster.pinnedStartMinute,
        }),
      )
    }

    for (const mod of source.modules) {
      blocks.set(
        mod.id,
        newBlock({
          kind: 'module',
          position:
            (mod.clusterId === null ? dayPositions.get(mod.id) : childPositions.get(mod.id)) ??
            keyBetween(null, null),
          parentId: mod.clusterId,
          title: mod.title,
          moduleTypeId: mod.moduleTypeId,
          durationMinutes: mod.durationMinutes,
          pinnedStartMinute: mod.pinnedStartMinute,
          desc: mod.desc,
          parked: mod.parked ?? false,
        }),
      )
    }
  })
}

function newBlock(fields: BlockFields): Y.Map<unknown> {
  const block = new Y.Map<unknown>()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) block.set(key, value)
  }
  return block
}

/**
 * Reads the CRDT back into the shape the editor, the exporter and the
 * scheduler already speak.
 *
 * One direction of a deliberate asymmetry: the DTO is derived, never stored.
 * Nothing downstream needs to know that a CRDT is involved.
 */
export function toDayDoc(doc: Y.Doc, moduleTypes: DayDoc['moduleTypes']): DayDoc | null {
  const day = dayOf(doc)
  const id = day.get('id')
  if (typeof id !== 'string') return null

  const blocks = blocksOf(doc)
  const clusters: ClusterDto[] = []
  const modules: ModuleDto[] = []

  const dayLevel: { id: string; position: string }[] = []
  const childrenByParent = new Map<string, { id: string; position: string }[]>()

  blocks.forEach((block, blockId) => {
    const position = String(block.get('position') ?? '')
    const parentId = (block.get('parentId') as string | null) ?? null
    if (parentId === null) dayLevel.push({ id: blockId, position })
    else {
      const bucket = childrenByParent.get(parentId)
      if (bucket) bucket.push({ id: blockId, position })
      else childrenByParent.set(parentId, [{ id: blockId, position }])
    }
  })

  const dayOrder = new Map(sortByPosition(dayLevel).map((row, index) => [row.id, index]))
  const childOrder = new Map<string, number>()
  for (const children of childrenByParent.values()) {
    sortByPosition(children).forEach((child, index) => childOrder.set(child.id, index))
  }

  blocks.forEach((block, blockId) => {
    const kind = block.get('kind')
    const parentId = (block.get('parentId') as string | null) ?? null

    if (kind === 'cluster') {
      clusters.push({
        id: blockId,
        title: String(block.get('title') ?? ''),
        color: (block.get('color') as ClusterDto['color']) ?? null,
        pinnedStartMinute: (block.get('pinnedStartMinute') as number | null) ?? null,
        collapsed: false,
        targetDurationMinutes: null,
        order: dayOrder.get(blockId) ?? 0,
      })
      return
    }

    modules.push({
      id: blockId,
      clusterId: parentId,
      moduleTypeId: String(block.get('moduleTypeId') ?? ''),
      title: String(block.get('title') ?? ''),
      durationMinutes: Number(block.get('durationMinutes') ?? 0),
      pinnedStartMinute: (block.get('pinnedStartMinute') as number | null) ?? null,
      desc: (block.get('desc') as Record<string, unknown>) ?? {},
      parked: block.get('parked') === true,
      order: (parentId === null ? dayOrder.get(blockId) : childOrder.get(blockId)) ?? 0,
    })
  })

  return {
    id,
    workshopId: String(day.get('workshopId') ?? ''),
    title: String(day.get('title') ?? ''),
    date: (day.get('date') as string | null) ?? null,
    startMinute: Number(day.get('startMinute') ?? 540),
    targetEndMinute: (day.get('targetEndMinute') as number | null) ?? null,
    desc: (day.get('desc') as Record<string, unknown>) ?? {},
    clusters,
    modules,
    moduleTypes,
  }
}

export type RawBlock = {
  id: string
  kind: BlockKind
  position: string
  parentId: string | null
  title: string
  moduleTypeId: string | null
  durationMinutes: number
  pinnedStartMinute: number | null
  color: string | null
  desc: Record<string, unknown>
  parked: boolean
}

/**
 * The blocks with their sort keys intact.
 *
 * `toDayDoc` projects ordinals, which is right for a client and wrong for
 * anything writing back to the database: the fractional key IS the stored
 * order, and reconstructing one from an ordinal would invent a value where a
 * real one already exists.
 */
const POSITION_FORMAT = /^[0-9A-Za-z]{1,64}$/
const MAX_DURATION_MINUTES = 1440

/**
 * The document says whatever a client put in a Y.Map; the tables have CHECK
 * constraints. The materialiser sits between the two and only logs when it
 * fails, so one malformed value used to stop every later write for that day --
 * permanently, and invisibly from the screen that caused it. The editor keeps
 * looking right because the editor reads the document; the export, the print
 * view and every MCP read go to the tables and quietly serve the last state
 * that got through.
 *
 * A block whose sort key cannot be repaired is dropped rather than guessed at:
 * inventing a position would move somebody's agenda item to a place they did
 * not put it. A duration is clamped, because a number out of range still says
 * what the block is, only not how long.
 */
export function readBlocks(doc: Y.Doc): RawBlock[] {
  const out: RawBlock[] = []

  blocksOf(doc).forEach((block, id) => {
    const kind = block.get('kind') === 'cluster' ? 'cluster' : 'module'
    const position = String(block.get('position') ?? '')
    if (!POSITION_FORMAT.test(position)) return

    out.push({
      id,
      kind,
      position,
      parentId: (block.get('parentId') as string | null) ?? null,
      title: String(block.get('title') ?? ''),
      moduleTypeId: (block.get('moduleTypeId') as string | undefined) ?? null,
      durationMinutes: clampDuration(block.get('durationMinutes')),
      pinnedStartMinute: (block.get('pinnedStartMinute') as number | null) ?? null,
      color: (block.get('color') as string | null) ?? null,
      desc: (block.get('desc') as Record<string, unknown>) ?? {},
      parked: block.get('parked') === true,
    })
  })

  return out
}

function clampDuration(raw: unknown): number {
  const minutes = Math.round(Number(raw))
  if (!Number.isFinite(minutes)) return 0
  return Math.min(Math.max(minutes, 0), MAX_DURATION_MINUTES)
}

export function readDayFields(doc: Y.Doc): {
  startMinute: number
  title: string
  desc: Record<string, unknown>
} {
  const day = dayOf(doc)
  return {
    startMinute: Number(day.get('startMinute') ?? 540),
    title: String(day.get('title') ?? ''),
    desc: (day.get('desc') as Record<string, unknown>) ?? {},
  }
}

/** Zero-padded so plain string comparison orders numerically. Ordering only. */
const pad = (order: number) => String(order).padStart(6, '0')

/** Evenly spaced fractional keys for a list that is already in order. */
function keysFor(ids: string[]): Map<string, string> {
  const out = new Map<string, string>()
  let previous: string | null = null
  for (const id of ids) {
    previous = keyBetween(previous, null)
    out.set(id, previous)
  }
  return out
}
