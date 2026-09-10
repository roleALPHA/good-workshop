import { describe, expect, it } from 'vitest'
import { getProjection, rowsForDrag, type ProjectionRow } from './projection'

const INDENT = 28

/** `C:id` a cluster, `m:id` a day-level module, `m:id>parent` a module in a cluster. */
function rows(spec: string): ProjectionRow[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [kind, rest] = token.split(':') as ['C' | 'm', string]
      const [id, parent] = rest.split('>')
      return kind === 'C'
        ? { id: id!, kind: 'cluster' as const, depth: 0 as const, parentId: null }
        : {
            id: id!,
            kind: 'module' as const,
            depth: (parent ? 1 : 0) as 0 | 1,
            parentId: parent ?? null,
          }
    })
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
