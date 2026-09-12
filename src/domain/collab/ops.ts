import * as Y from 'yjs'
import { keyAtEnd, placeAfter, sortByPosition, type Ordered } from '@/domain/agenda/ordering'
import { blocksOf, dayOf } from './doc'

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
}

export type NewModuleBlock = {
  moduleTypeId: string
  title: string
  durationMinutes: number
  pinnedStartMinute?: number | null
  desc?: Record<string, unknown>
  parentId?: string | null
}

export type NewClusterBlock = {
  title: string
  color?: string | null
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
      }),
    )
  })
}

/** Appends a cluster to the end of the day. Clusters only ever live at day level. */
export function addClusterBlock(doc: Y.Doc, id: string, input: NewClusterBlock): void {
  const blocks = blocksOf(doc)

  doc.transact(() => {
    blocks.set(
      id,
      buildBlock({
        kind: 'cluster',
        parentId: null,
        position: keyAtEnd(siblings(blocks, null)),
        title: input.title,
        color: input.color ?? null,
      }),
    )
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

  const children: string[] = []
  if (block.get('kind') === 'cluster') {
    blocks.forEach((candidate, id) => {
      if (((candidate.get('parentId') as string | null) ?? null) === blockId) children.push(id)
    })
  }

  doc.transact(() => {
    for (const id of children) blocks.delete(id)
    blocks.delete(blockId)
  })
  return children.length + 1
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

  // A cluster inside a cluster is not a shape this product has; clamping here
  // means no caller has to remember that.
  const target = moving.get('kind') === 'cluster' ? null : parentId
  if (target !== null && !blocks.has(target)) return false

  doc.transact(() => {
    const placement = placeAfter(siblings(blocks, target, blockId), afterId)
    applyPlacement(blocks, moving, placement)
    moving.set('parentId', target)
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
