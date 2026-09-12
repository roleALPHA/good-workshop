import { describe, expect, it } from 'vitest'
import {
  getFolderProjection,
  rowsForDrag,
  MAX_FOLDER_DEPTH,
  type FolderRow,
} from './folder-projection'

/**
 * Where a dragged folder would land.
 *
 * The sidebar looks like a list and is a tree, and nesting is expressed by
 * dragging sideways. Get this subtly wrong and every drag feels haunted, so it
 * is pure, it never touches the DOM, and the table below was written before a
 * line of the implementation.
 */

const INDENT = 12

/**
 *  a
 *    b
 *      c
 *  d
 *  e
 */
const TREE: FolderRow[] = [
  { id: 'a', parentId: null, depth: 0 },
  { id: 'b', parentId: 'a', depth: 1 },
  { id: 'c', parentId: 'b', depth: 2 },
  { id: 'd', parentId: null, depth: 0 },
  { id: 'e', parentId: null, depth: 0 },
]

type Case = {
  name: string
  activeId: string
  overId: string
  offsetX: number
  depth: number
  parentId: string | null
  afterId: string | null
}

const cases: Case[] = [
  {
    name: 'to the very top, before everything',
    activeId: 'd',
    overId: 'a',
    offsetX: 0,
    depth: 0,
    parentId: null,
    afterId: null,
  },
  {
    name: 'onto the row below a folder: its first child',
    activeId: 'e',
    overId: 'b',
    offsetX: 0,
    depth: 1,
    parentId: 'a',
    afterId: null,
  },
  {
    name: 'past a whole subtree stays at the top level, behind the subtree root',
    activeId: 'e',
    overId: 'd',
    offsetX: 0,
    depth: 0,
    parentId: null,
    afterId: 'a',
  },
  {
    name: 'dragged sideways at the same spot, it nests as deep as it is allowed',
    activeId: 'e',
    overId: 'd',
    offsetX: 2 * INDENT,
    depth: 2,
    parentId: 'b',
    afterId: 'c',
  },
  {
    name: 'a folder carrying a subtree can still become a child',
    activeId: 'a',
    overId: 'e',
    offsetX: INDENT,
    depth: 1,
    parentId: 'e',
    afterId: null,
  },
  {
    name: 'dropping it where it already is changes nothing',
    activeId: 'd',
    overId: 'd',
    offsetX: 0,
    depth: 0,
    parentId: null,
    afterId: 'a',
  },
  {
    name: 'pulled further left than the top level, it stops at the top level',
    activeId: 'c',
    overId: 'c',
    offsetX: -5 * INDENT,
    depth: 0,
    parentId: null,
    afterId: 'a',
  },
  {
    name: 'pushed further right than the row above allows, it stops one below it',
    activeId: 'e',
    overId: 'e',
    offsetX: 9 * INDENT,
    depth: 1,
    parentId: 'd',
    afterId: null,
  },
]

describe('where a dragged folder lands', () => {
  it.each(cases)('$name', ({ activeId, overId, offsetX, depth, parentId, afterId }) => {
    const projection = getFolderProjection(TREE, activeId, overId, offsetX, INDENT)

    expect(projection.valid).toBe(true)
    expect(projection.depth).toBe(depth)
    expect(projection.parentId).toBe(parentId)
    expect(projection.afterId).toBe(afterId)
  })

  it('refuses a drag whose active row is not in the tree', () => {
    expect(getFolderProjection(TREE, 'gone', 'a', 0, INDENT).valid).toBe(false)
  })

  it('refuses a drop on a row that is not in the tree', () => {
    expect(getFolderProjection(TREE, 'a', 'gone', 0, INDENT).valid).toBe(false)
  })

  it('refuses everything when the tree is empty', () => {
    expect(getFolderProjection([], 'a', 'b', 0, INDENT).valid).toBe(false)
  })

  /**
   * The check constraint folder_depth caps ancestor_ids at seven, so a folder
   * that carries a subtree cannot go as deep as a leaf can -- its children
   * would breach the cap and the write would be refused after the fact.
   */
  it('leaves room for the subtree it carries', () => {
    const chain: FolderRow[] = Array.from({ length: MAX_FOLDER_DEPTH + 1 }, (_, i) => ({
      id: `n${i}`,
      parentId: i === 0 ? null : `n${i - 1}`,
      depth: i,
    }))
    // A root with one child, dragged to the deepest row and pushed right.
    const withPair: FolderRow[] = [
      ...chain,
      { id: 'p', parentId: null, depth: 0 },
      { id: 'q', parentId: 'p', depth: 1 },
    ]

    const projection = getFolderProjection(
      withPair,
      'p',
      `n${MAX_FOLDER_DEPTH}`,
      9 * INDENT,
      INDENT,
    )

    expect(projection.valid).toBe(true)
    expect(projection.depth).toBe(MAX_FOLDER_DEPTH - 1)
  })
})

describe('the rows a drag operates on', () => {
  it('takes the dragged folder its own subtree out, so it cannot land inside itself', () => {
    expect(rowsForDrag(TREE, 'a').map((row) => row.id)).toEqual(['a', 'd', 'e'])
  })

  it('leaves a leaf drag alone', () => {
    expect(rowsForDrag(TREE, 'e').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
