import { describe, expect, it } from 'vitest'
import type { Depth } from './flatten'
import { getProjection, rowsForDrag, type ProjectionRow } from './projection'

const INDENT = 28

/**
 * `C:id` a section, `B:id` a breakout, `m:id` a block; `x>parent` puts it in
 * one. Depth is derived from the parent chain rather than written out, so a
 * token stays readable once there are three levels of it.
 */
function rows(spec: string): ProjectionRow[] {
  const out: ProjectionRow[] = []
  const depthById = new Map<string, Depth>()
  for (const token of spec.trim().split(/\s+/)) {
    const [kind, rest] = token.split(':') as ['C' | 'B' | 'm', string]
    const [id, parent] = rest.split('>')
    const depth = (parent ? (depthById.get(parent) ?? 0) + 1 : 0) as Depth
    depthById.set(id!, depth)
    out.push({
      id: id!,
      kind: kind === 'm' ? 'module' : 'cluster',
      mode: kind === 'B' ? 'parallel' : 'sequential',
      depth,
      parentId: parent ?? null,
    })
  }
  return out
}

const project = (
  spec: string,
  activeId: string,
  overId: string,
  offsetX = 0,
): ReturnType<typeof getProjection> => {
  const all = rows(spec)
  return getProjection(rowsForDrag(all, activeId), activeId, overId, offsetX, INDENT)
}

describe('getProjection / depth and parent', () => {
  it('keeps a day-level module at day level when dragged straight down', () => {
    expect(project('m:a m:b m:c', 'a', 'c')).toMatchObject({
      depth: 0,
      parentId: null,
      index: 2,
      valid: true,
    })
  })

  it('moves a module INTO a cluster when dropped on the cluster row', () => {
    expect(project('m:a C:c1 m:x>c1', 'a', 'c1', INDENT)).toMatchObject({
      depth: 1,
      parentId: 'c1',
    })
  })

  it('makes a module the first child when dropped on an EMPTY cluster', () => {
    expect(project('m:a C:c1', 'a', 'c1', INDENT)).toMatchObject({ depth: 1, parentId: 'c1' })
  })

  it('accepts a drop into a COLLAPSED cluster, whose children are not rendered', () => {
    // A collapsed cluster renders as a single row; landing on it still means
    // "first child of that cluster".
    expect(project('m:a C:c1 m:z', 'a', 'c1', INDENT)).toMatchObject({
      depth: 1,
      parentId: 'c1',
    })
  })

  it('moves a module OUT of its cluster when dragged left', () => {
    expect(project('C:c1 m:a>c1 m:b>c1 m:z', 'b', 'z', -INDENT)).toMatchObject({
      depth: 0,
      parentId: null,
    })
  })

  it('moves a module BETWEEN two clusters', () => {
    expect(project('C:c1 m:a>c1 C:c2 m:b>c2', 'a', 'b', 0)).toMatchObject({
      depth: 1,
      parentId: 'c2',
    })
  })

  it('reorders a cluster among day-level rows', () => {
    expect(project('C:c1 m:a>c1 m:z C:c2', 'c1', 'c2')).toMatchObject({
      depth: 0,
      parentId: null,
    })
  })
})

describe('getProjection / clamping', () => {
  it('never nests a cluster, however far right it is dragged', () => {
    expect(project('C:c1 m:a>c1 C:c2', 'c2', 'a', INDENT * 5)).toMatchObject({ depth: 0 })
  })

  it('clamps depth to 1 -- there are no nested clusters', () => {
    expect(project('C:c1 m:a>c1 m:b', 'b', 'a', INDENT * 5)).toMatchObject({
      depth: 1,
      parentId: 'c1',
    })
  })

  it('clamps to day level at the very first position, where no parent exists', () => {
    expect(project('m:a C:c1 m:b>c1', 'b', 'a', INDENT * 3)).toMatchObject({
      depth: 0,
      parentId: null,
    })
  })

  it('keeps depth 1 when the row below is a cluster child, so a cluster is not split', () => {
    // Dropping at day level here would leave `b` orphaned in the middle of c1.
    expect(project('m:z C:c1 m:a>c1 m:b>c1', 'z', 'a', -INDENT * 3)).toMatchObject({ depth: 1 })
  })

  it('allows day level at the last position, where nothing follows', () => {
    expect(project('C:c1 m:a>c1 m:z', 'z', 'z', -INDENT * 3)).toMatchObject({
      depth: 0,
      parentId: null,
    })
  })
})

describe('getProjection / a cluster travels as one unit', () => {
  it('removes a dragged cluster subtree from the list, making a drop into itself impossible', () => {
    const all = rows('C:c1 m:a>c1 m:b>c1 m:z')
    expect(rowsForDrag(all, 'c1').map((r) => r.id)).toEqual(['c1', 'z'])
  })

  it('leaves the list untouched while a module is dragged', () => {
    const all = rows('C:c1 m:a>c1 m:z')
    expect(rowsForDrag(all, 'a').map((r) => r.id)).toEqual(['c1', 'a', 'z'])
  })
})

describe('getProjection / degenerate input', () => {
  it('reports invalid rather than guessing when the active row is unknown', () => {
    expect(project('m:a m:b', 'ghost', 'b')).toMatchObject({ valid: false })
  })

  it('reports invalid rather than guessing when the drop target is unknown', () => {
    expect(project('m:a m:b', 'a', 'ghost')).toMatchObject({ valid: false })
  })

  it('handles a drop onto the row itself as a no-op at its own depth', () => {
    expect(project('C:c1 m:a>c1', 'a', 'a')).toMatchObject({
      depth: 1,
      parentId: 'c1',
      index: 1,
      valid: true,
    })
  })
})

describe('getProjection / drag offset maps to indentation steps', () => {
  // A position where BOTH depths are actually available: below a cluster child
  // (so nesting is allowed) and above a day-level row (so day level is too).
  // Between a cluster header and its first child, by contrast, only depth 1 is
  // legal -- the offset cannot override that, and must not.
  it.each([
    [0, 0],
    [INDENT * 0.4, 0],
    [INDENT * 0.6, 1],
    [INDENT * 1.4, 1],
    [INDENT * 9, 1],
  ])('an offset of %ipx projects depth %i', (offset, expected) => {
    expect(project('C:c1 m:x>c1 m:a m:b', 'b', 'a', offset).depth).toBe(expected)
  })

  it('ignores the offset where only one depth is legal', () => {
    // Inserting between a cluster header and its first child: depth 1 or the
    // cluster would be split in two.
    for (const offset of [-INDENT * 5, 0, INDENT * 5]) {
      expect(project('C:c1 m:x>c1 m:a', 'a', 'x', offset).depth).toBe(1)
    }
  })
})

/**
 * A breakout is where the flat outline stops being one-dimensional: strands are
 * columns on screen. The rule this section nails down is that a horizontal drag
 * offset means nesting only where nesting is INVISIBLE -- inside a breakout the
 * column under the pointer already answers the question, and having two answers
 * to it is what makes a drag feel haunted.
 */
describe('getProjection / breakouts', () => {
  /** A breakout with two strands of one block, and a day-level block after it. */
  // A block above the breakout, because dropping ON a container row only means
  // "into it" when the container is above the landing spot -- dragging upwards
  // onto a header has always meant "before it".
  const DAY = 'm:top B:bo C:s1>bo m:x>s1 C:s2>bo m:y>s2 m:z'

  it('snaps a block dropped on the breakout head into its first strand', () => {
    expect(project(DAY, 'top', 'bo')).toMatchObject({ depth: 2, parentId: 's1', valid: true })
  })

  it('keeps a block at strand depth however far right it is dragged', () => {
    expect(project(DAY, 'z', 'x', INDENT * 9)).toMatchObject({ depth: 2, parentId: 's1' })
  })

  it.each([-INDENT * 5, -INDENT, 0, INDENT, INDENT * 5])(
    'ignores a horizontal offset of %ipx inside a breakout',
    (offset) => {
      expect(project(DAY, 'z', 'y', offset)).toMatchObject({ depth: 2, parentId: 's2' })
    },
  )

  it('lands a block at the end of the strand it was dropped in', () => {
    expect(project(DAY, 'z', 'x')).toMatchObject({ depth: 2, parentId: 's1', afterId: null })
  })

  it('turns a strand dragged to day level into an ordinary section', () => {
    expect(project(DAY, 's1', 'z')).toMatchObject({ depth: 0, parentId: null, valid: true })
  })

  it('turns a section dragged onto a breakout into a strand of it', () => {
    const spec = 'B:bo C:s1>bo m:x>s1 C:sec m:q>sec'
    expect(project(spec, 'sec', 's1')).toMatchObject({ depth: 1, parentId: 'bo', valid: true })
  })

  it('never nests a breakout, however far right it goes', () => {
    const spec = 'C:sec m:q>sec B:bo C:s1>bo'
    expect(project(spec, 'bo', 'q', INDENT * 5)).toMatchObject({ depth: 0, parentId: null })
  })

  it('refuses to put a strand inside a strand', () => {
    const spec = 'B:bo C:s1>bo m:x>s1 C:s2>bo'
    expect(project(spec, 's2', 'x', INDENT * 3)).toMatchObject({ depth: 1, parentId: 'bo' })
  })

  it('takes the whole subtree out of the list while a breakout is dragged', () => {
    // The old filter only removed direct children, so a breakout's BLOCKS
    // stayed behind -- and a breakout could be dropped into its own strand.
    const ids = rowsForDrag(rows(DAY), 'bo').map((r) => r.id)
    expect(ids).toEqual(['top', 'bo', 'z'])
  })

  it('takes a strand’s blocks out of the list while the strand is dragged', () => {
    expect(rowsForDrag(rows(DAY), 's1').map((r) => r.id)).toEqual([
      'top',
      'bo',
      's1',
      's2',
      'y',
      'z',
    ])
  })

  it('leaves a block’s siblings alone while the block is dragged', () => {
    expect(rowsForDrag(rows(DAY), 'x').map((r) => r.id)).toEqual([
      'top',
      'bo',
      's1',
      'x',
      's2',
      'y',
      'z',
    ])
  })

  it('still reads a plain section the way it always did', () => {
    // The outline mode has to be untouched: everything outside a breakout is
    // exactly the gesture it was.
    const spec = 'm:z C:sec m:q>sec'
    expect(project(spec, 'z', 'sec', INDENT)).toMatchObject({ depth: 1, parentId: 'sec' })
    expect(project(spec, 'z', 'q', INDENT)).toMatchObject({ depth: 1, parentId: 'sec' })
    // And out again: the offset still decides, because nothing here is a column.
    expect(project(spec, 'q', 'q', -INDENT * 3)).toMatchObject({ depth: 0, parentId: null })
  })
})
