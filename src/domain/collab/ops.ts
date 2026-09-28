import * as Y from 'yjs'
import { keyAtEnd, placeAfter, sortByPosition, type Ordered } from '@/domain/agenda/ordering'
import { normalizeResponsible, type Responsible } from '@/domain/agenda/responsible'
import type { ClusterMode } from '@/domain/agenda/types'
import { blocksOf, dayOf, modeOf, type BlockKind } from './doc'

/**
 * Mutations on the shared document.
 *
 * Here rather than next to the editor because they have two callers now: a
 * person dragging a block, and an LLM writing through MCP. Both go through the
 * same room and therefore through the same operations -- if the model had its
 * own write path, its changes and a person's changes would be two sources of
 * truth for one day, and the materialiser would silently delete whichever it
 * did not know about.
 *
 * Every operation is one `transact`, so collaborators see one change rather
 * than a flicker of intermediate states.
 */

export type BlockPatch = {
  title?: string
  durationMinutes?: number
  pinnedStartMinute?: number | null
  desc?: Record<string, unknown>
  color?: string | null
  parentId?: string | null
  /** Set aside: in the day, out of the schedule. */
  parked?: boolean
  /** Who answers for the block. The whole list; an empty one clears it. */
  responsible?: Responsible[]
}

export type NewModuleBlock = {
  moduleTypeId: string
  title: string
  durationMinutes: number
  pinnedStartMinute?: number | null
  desc?: Record<string, unknown>
  parentId?: string | null
  /** Straight onto the shelf -- a block arriving from another day's parking area. */
  parked?: boolean
  responsible?: Responsible[]
}

/**
 * Everything a block takes with it to another day.
 *
 * Not its id, its position or its cluster: those describe where it sat in the
 * day it is leaving, and the day it arrives in decides all three afresh.
 */
export type ModuleSnapshot = {
  moduleTypeId: string
  title: string
  durationMinutes: number
  pinnedStartMinute: number | null
  desc: Record<string, unknown>
  parked: boolean
  /** The people go with the block: a block parked for tomorrow is still theirs. */
  responsible: Responsible[]
}

export type NewClusterBlock = {
  title: string
  color?: string | null
  /** 'parallel' makes it a breakout: it holds strands that run at the same time. */
  mode?: ClusterMode
  /** The breakout this becomes a strand of. A breakout itself sits on the day. */
  parentId?: string | null
}

export type NewBreakout = {
  title: string
  color?: string | null
  /** The strands, in the order they stand next to each other. */
  strands: { id: string; title: string }[]
}

/**
 * Which parent a block may actually have.
 *
 * The shape is two storeys and not arbitrarily deep: a breakout holds strands,
 * a strand holds blocks, a block holds nothing. Clamped here means no caller --
 * a drag, a keystroke, a model over MCP -- has to remember that, and the
 * materialiser clamps rather than repairs.
 */
function allowedParent(
  blocks: Y.Map<Y.Map<unknown>>,
  moving: { id: string; kind: BlockKind; mode: ClusterMode },
  wanted: string | null,
): { ok: boolean; parentId: string | null } {
  if (wanted === null) return { ok: true, parentId: null }
  if (wanted === moving.id) return { ok: false, parentId: null }

  const parent = blocks.get(wanted)
  if (!parent || parent.get('kind') !== 'cluster') return { ok: false, parentId: null }

  if (moving.kind === 'cluster') {
    // Only a breakout holds sections, and only a sequential one can be held.
    const ok = modeOf(parent) === 'parallel' && moving.mode === 'sequential'
    return ok ? { ok: true, parentId: wanted } : { ok: false, parentId: null }
  }

  // A block goes into a section or into a strand -- never straight into a
  // breakout, which holds strands and nothing else.
  return modeOf(parent) === 'sequential'
    ? { ok: true, parentId: wanted }
    : { ok: false, parentId: null }
}

/**
 * What a block in the document says it is.
 *
 * Taken as plain values rather than read off the Y.Map at the point of use,
 * because a block being CREATED is not in the document yet and Yjs refuses to
 * read an unintegrated type. One shape for both callers beats two rules.
 */
function describeBlock(block: Y.Map<unknown>, id: string) {
  const kind: BlockKind = block.get('kind') === 'cluster' ? 'cluster' : 'module'
  return { id, kind, mode: kind === 'cluster' ? modeOf(block) : ('sequential' as ClusterMode) }
}

export function patchBlock(doc: Y.Doc, blockId: string, patch: BlockPatch): boolean {
  const block = blocksOf(doc).get(blockId)
  if (!block) return false

  doc.transact(() => {
    // Field by field, because that is the granularity that lets two people
    // edit the title and the duration of one block at the same time.
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) block.set(key, value)
    }
  })
  return true
}

/** Appends a module to the end of the day, or of a cluster. */
export function addModuleBlock(doc: Y.Doc, id: string, input: NewModuleBlock): void {
  const blocks = blocksOf(doc)
  const parentId = input.parentId ?? null

  doc.transact(() => {
    blocks.set(
      id,
      buildBlock({
        kind: 'module',
        parentId,
        position: keyAtEnd(siblings(blocks, parentId)),
        title: input.title,
        moduleTypeId: input.moduleTypeId,
        durationMinutes: input.durationMinutes,
        pinnedStartMinute: input.pinnedStartMinute ?? null,
        desc: input.desc ?? {},
        parked: input.parked,
        responsible: input.responsible,
      }),
    )
  })
}

/** A module as it would travel. Null for a cluster, or for a block that is not here. */
export function snapshotModule(doc: Y.Doc, blockId: string): ModuleSnapshot | null {
  const block = blocksOf(doc).get(blockId)
  if (!block || block.get('kind') === 'cluster') return null

  return {
    moduleTypeId: String(block.get('moduleTypeId') ?? ''),
    title: String(block.get('title') ?? ''),
    durationMinutes: Number(block.get('durationMinutes') ?? 0),
    pinnedStartMinute: (block.get('pinnedStartMinute') as number | null) ?? null,
    desc: (block.get('desc') as Record<string, unknown>) ?? {},
    parked: block.get('parked') === true,
    responsible: normalizeResponsible(block.get('responsible')),
  }
}

/** The blocks set aside on this day, in the order they sit in. */
export function parkedModules(doc: Y.Doc): (ModuleSnapshot & { id: string })[] {
  const blocks = blocksOf(doc)
  const parked: Ordered[] = []
  blocks.forEach((block, id) => {
    if (block.get('kind') !== 'cluster' && block.get('parked') === true) {
      parked.push({ id, position: String(block.get('position') ?? '') })
    }
  })

  return sortByPosition(parked).map(({ id }) => ({ id, ...snapshotModule(doc, id)! }))
}

/**
 * Appends a cluster: a section on the day, a breakout, or a strand of one.
 *
 * `mode` is always written, even 'sequential'. Absence stays valid for
 * documents from before breakouts; new ones say what they are.
 */
export function addClusterBlock(doc: Y.Doc, id: string, input: NewClusterBlock): void {
  const blocks = blocksOf(doc)
  const mode = input.mode ?? 'sequential'

  doc.transact(() => {
    const block = buildBlock({
      kind: 'cluster',
      parentId: null,
      position: 'a0',
      title: input.title,
      color: input.color ?? null,
      mode,
    })
    // Asked through the same gate a move uses, so "where may this live" has one
    // answer and not two: a breakout is clamped back to the day, a strand keeps
    // the breakout it names.
    const target = allowedParent(blocks, { id, kind: 'cluster', mode }, input.parentId ?? null)
    block.set('parentId', target.parentId)
    block.set('position', keyAtEnd(siblings(blocks, target.parentId)))
    blocks.set(id, block)
  })
}

/**
 * A breakout with its strands, in one transaction.
 *
 * "Add a breakout" is one act, not three. Written as three the people sharing
 * the room would see the intermediate states flicker past -- an empty breakout,
 * then one strand, then two -- and an interrupted write would leave a breakout
 * that holds nothing.
 */
export function addBreakoutBlock(doc: Y.Doc, id: string, input: NewBreakout): void {
  // Nested transacts are folded into the outer one by Yjs, so the strands and
  // their breakout reach everybody else as a single change.
  doc.transact(() => {
    addClusterBlock(doc, id, { title: input.title, color: input.color ?? null, mode: 'parallel' })
    for (const strand of input.strands) {
      addClusterBlock(doc, strand.id, { title: strand.title, mode: 'sequential', parentId: id })
    }
  })
}

/**
 * Deletes a block, and a cluster's children with it.
 *
 * Leaving the children behind would strand them on a parent that no longer
 * exists. The materialiser rescues orphans onto the day, so the blocks would
 * survive -- but as a scatter of loose modules where a section used to be,
 * which is not what anyone means by "delete this section".
 */
export function removeBlock(doc: Y.Doc, blockId: string): number {
  const blocks = blocksOf(doc)
  const block = blocks.get(blockId)
  if (!block) return 0

  const childrenOf = new Map<string, string[]>()
  blocks.forEach((candidate, id) => {
    const parent = (candidate.get('parentId') as string | null) ?? null
    if (parent === null) return
    const bucket = childrenOf.get(parent)
    if (bucket) bucket.push(id)
    else childrenOf.set(parent, [id])
  })

  // Breadth-first with `seen`: a parent loop, which two clients writing the
  // same document can produce in principle, must not become an endless loop
  // here. Deleting a section is the last place one wants a frozen tab.
  const doomed: string[] = []
  const seen = new Set([blockId])
  const queue = [blockId]
  while (queue.length > 0) {
    const id = queue.shift()!
    doomed.push(id)
    for (const child of childrenOf.get(id) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      queue.push(child)
    }
  }

  doc.transact(() => {
    for (const id of doomed) blocks.delete(id)
  })
  return doomed.length
}

/**
 * Moves a block behind a named sibling, or to the top when `afterId` is null.
 *
 * Anchor-based rather than index-based: if a sibling moved in the meantime you
 * still land behind the right neighbour instead of at a stale index.
 */
export function moveBlock(
  doc: Y.Doc,
  blockId: string,
  parentId: string | null,
  afterId: string | null,
): boolean {
  const blocks = blocksOf(doc)
  const moving = blocks.get(blockId)
  if (!moving) return false

  // Refused rather than silently clamped to the day. A cluster that quietly
  // jumps somewhere nobody aimed at is exactly the haunted feeling this
  // module's sibling warns about -- the caller gets to say something instead.
  const target = allowedParent(blocks, describeBlock(moving, blockId), parentId)
  if (!target.ok) return false

  doc.transact(() => {
    const placement = placeAfter(siblings(blocks, target.parentId, blockId), afterId)
    applyPlacement(blocks, moving, placement)
    moving.set('parentId', target.parentId)
  })
  return true
}

/** Empties the day. Destructive by design, and only ever called by name. */
export function clearBlocks(doc: Y.Doc): number {
  const blocks = blocksOf(doc)
  const ids = [...blocks.keys()]
  doc.transact(() => {
    for (const id of ids) blocks.delete(id)
  })
  return ids.length
}

export function setDayFields(doc: Y.Doc, fields: Record<string, unknown>): void {
  const day = dayOf(doc)
  doc.transact(() => {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) day.set(key, value)
    }
  })
}

/** The blocks under a parent, with their sort keys, ready for `placeAfter`. */
export function siblings(
  blocks: Y.Map<Y.Map<unknown>>,
  parentId: string | null,
  exclude?: string,
): Ordered[] {
  const out: Ordered[] = []
  blocks.forEach((block, id) => {
    if (id === exclude) return
    if (((block.get('parentId') as string | null) ?? null) !== parentId) return
    out.push({ id, position: String(block.get('position') ?? '') })
  })
  return sortByPosition(out)
}

export function applyPlacement(
  blocks: Y.Map<Y.Map<unknown>>,
  moving: Y.Map<unknown>,
  placement: ReturnType<typeof placeAfter>,
): void {
  if (!placement.rebalance) {
    moving.set('position', placement.position)
    return
  }

  // Rare, cheap and invisible: keys have grown long enough that the sibling
  // list is redistributed. Inside the caller's transaction, so collaborators
  // see one reorder rather than a cascade.
  for (const row of placement.rebalance) {
    if (row.id === '') continue
    blocks.get(row.id)?.set('position', row.position)
  }
  const slot = placement.rebalance.find((row) => row.id === '')
  if (slot) moving.set('position', slot.position)
}

function buildBlock(fields: Record<string, unknown>): Y.Map<unknown> {
  const block = new Y.Map<unknown>()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) block.set(key, value)
  }
  return block
}
