import * as Y from 'yjs'
import { blocksOf } from '@/domain/collab/doc'
import { placeAfter, sortByPosition } from '@/domain/agenda/ordering'
import type { ModulePatch, NewBlock } from '@/features/agenda/document'
import type { Projection } from '@/features/agenda/projection'

/**
 * Mutations on the shared document.
 *
 * Every one is wrapped in a single `transact`, so collaborators see one change
 * rather than a flicker of intermediate states -- and so an undo step matches
 * what the person actually did.
 *
 * Ordering uses the same helpers as the server, deliberately: two
 * implementations of "where does this go" would eventually disagree about a
 * sort key, and the disagreement would only surface as blocks jumping around
 * on somebody else's screen.
 */

export function patchModule(doc: Y.Doc, moduleId: string, patch: ModulePatch): void {
  const block = blocksOf(doc).get(moduleId)
  if (!block) return

  doc.transact(() => {
    // Field by field, because that is the granularity that lets two people
    // edit the title and the duration of one block at the same time.
    if (patch.title !== undefined) block.set('title', patch.title)
    if (patch.durationMinutes !== undefined) block.set('durationMinutes', patch.durationMinutes)
    if (patch.pinnedStartMinute !== undefined)
      block.set('pinnedStartMinute', patch.pinnedStartMinute)
    if (patch.desc !== undefined) block.set('desc', patch.desc)
  })
}

export function removeModule(doc: Y.Doc, moduleId: string): void {
  doc.transact(() => blocksOf(doc).delete(moduleId))
}

export function addModule(doc: Y.Doc, id: string, input: NewBlock): void {
  const blocks = blocksOf(doc)

  doc.transact(() => {
    const block = new Y.Map<unknown>()
    block.set('kind', 'module')
    block.set('parentId', null)
    block.set('position', endOfDay(blocks))
    block.set('title', input.title)
    block.set('moduleTypeId', input.moduleTypeId)
    block.set('durationMinutes', input.durationMinutes)
    block.set('pinnedStartMinute', null)
    block.set('desc', {})
    blocks.set(id, block)
  })
}

/**
 * Applies a finished drag.
 *
 * Two field writes on one block: a new parent and a new sort key. That is the
 * whole reason for fractional ordering -- two people dragging different blocks
 * touch different rows and never conflict.
 */
export function applyProjection(doc: Y.Doc, blockId: string, projection: Projection): void {
  if (!projection.valid) return

  const blocks = blocksOf(doc)
  const moving = blocks.get(blockId)
  if (!moving) return

  const parentId = projection.depth === 0 ? null : projection.parentId

  const siblings: { id: string; position: string }[] = []
  blocks.forEach((block, id) => {
    if (id === blockId) return
    const blockParent = (block.get('parentId') as string | null) ?? null
    if (blockParent === parentId) {
      siblings.push({ id, position: String(block.get('position') ?? '') })
    }
  })

  const ordered = sortByPosition(siblings)
  const anchor = ordered[Math.max(0, Math.min(projection.index, ordered.length) - 1)]?.id ?? null
  const placement = placeAfter(ordered, anchor)

  doc.transact(() => {
    if (placement.rebalance) {
      // Rare, cheap and invisible: keys have grown long enough that the sibling
      // list is redistributed. Inside the same transaction, so collaborators
      // see one reorder rather than a cascade.
      for (const row of placement.rebalance) {
        if (row.id === '') continue
        blocks.get(row.id)?.set('position', row.position)
      }
      const slot = placement.rebalance.find((row) => row.id === '')
      if (slot) moving.set('position', slot.position)
    } else {
      moving.set('position', placement.position)
    }
    moving.set('parentId', parentId)
  })
}

function endOfDay(blocks: Y.Map<Y.Map<unknown>>): string {
  const dayLevel: { id: string; position: string }[] = []
  blocks.forEach((block, id) => {
    if (((block.get('parentId') as string | null) ?? null) === null) {
      dayLevel.push({ id, position: String(block.get('position') ?? '') })
    }
  })
  return placeAfter(sortByPosition(dayLevel), sortByPosition(dayLevel).at(-1)?.id ?? null).position
}
