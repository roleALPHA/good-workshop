import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { blocksOf, dayOf } from '@/domain/collab/doc'
import { addClusterBlock, addModuleBlock } from '@/domain/collab/ops'
import { sortByPosition } from '@/domain/agenda/ordering'
import type { Projection } from '@/features/agenda/projection'
import { applyProjection } from './y-ops'

/**
 * Turning a finished drag into two field writes.
 *
 * The projection says "depth 1, under this cluster, at index 2"; the document
 * stores parents and sort keys. This is where the one becomes the other, and
 * an off-by-one here shows up as a block that lands one row from where the
 * pointer was -- which reads as the editor being haunted.
 */

function day(): Y.Doc {
  const doc = new Y.Doc()
  dayOf(doc).set('id', 'day-1')
  return doc
}

const add = (doc: Y.Doc, id: string, parentId: string | null = null) =>
  addModuleBlock(doc, id, { moduleTypeId: 't', title: id, durationMinutes: 30, parentId })

// Plain byte comparison, exactly like sortByPosition. localeCompare would
// order 'Zz' after 'a0' and quietly disagree with the running product.
const at = (doc: Y.Doc, parentId: string | null) =>
  sortByPosition(
    [...blocksOf(doc).entries()]
      .filter(([, block]) => ((block.get('parentId') as string | null) ?? null) === parentId)
      .map(([id, block]) => ({ id, position: String(block.get('position')) })),
  ).map((row) => row.id)

const projection = (partial: Partial<Projection>): Projection => ({
  depth: 0,
  parentId: null,
  index: 0,
  afterId: null,
  valid: true,
  ...partial,
})

describe('applyProjection', () => {
  it('ignores an invalid drop', () => {
    const doc = day()
    add(doc, 'a')
    add(doc, 'b')
    applyProjection(doc, 'b', projection({ afterId: null, valid: false }))
    expect(at(doc, null)).toEqual(['a', 'b'])
  })

  it('ignores a block that is no longer there', () => {
    const doc = day()
    add(doc, 'a')
    expect(() => applyProjection(doc, 'weg', projection({}))).not.toThrow()
  })

  it('moves a block to the top', () => {
    const doc = day()
    add(doc, 'a')
    add(doc, 'b')
    add(doc, 'c')
    applyProjection(doc, 'c', projection({ afterId: null }))
    expect(at(doc, null)).toEqual(['c', 'a', 'b'])
  })

  it('moves a block to the end', () => {
    const doc = day()
    add(doc, 'a')
    add(doc, 'b')
    add(doc, 'c')
    applyProjection(doc, 'a', projection({ afterId: 'c' }))
    expect(at(doc, null)).toEqual(['b', 'c', 'a'])
  })

  it('drops a block into a cluster', () => {
    const doc = day()
    addClusterBlock(doc, 'k', { title: 'Warm-up' })
    add(doc, 'drin', 'k')
    add(doc, 'wandert')

    applyProjection(doc, 'wandert', projection({ depth: 1, parentId: 'k', afterId: 'drin' }))
    expect(at(doc, 'k')).toEqual(['drin', 'wandert'])
    expect(at(doc, null)).toEqual(['k'])
  })

  it('lifts a block back out of a cluster', () => {
    const doc = day()
    addClusterBlock(doc, 'k', { title: 'Warm-up' })
    add(doc, 'drin', 'k')
    add(doc, 'danach')

    applyProjection(doc, 'drin', projection({ depth: 0, parentId: null, afterId: 'danach' }))
    expect(at(doc, 'k')).toEqual([])
    expect(at(doc, null)).toEqual(['k', 'danach', 'drin'])
  })

  it('ignores the projected parent at depth 0', () => {
    // Depth is what decides; a stale parentId travelling with it must not
    // quietly nest the block anyway.
    const doc = day()
    addClusterBlock(doc, 'k', { title: 'K' })
    add(doc, 'a')
    applyProjection(doc, 'a', projection({ depth: 0, parentId: 'k', afterId: 'k' }))
    expect(blocksOf(doc).get('a')!.get('parentId')).toBeNull()
  })
})
