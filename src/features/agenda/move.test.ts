import { describe, expect, it } from 'vitest'
import type { DayDoc } from '@/domain/agenda/types'
import { flattenDay } from './flatten'
import { applyMove } from './move'
import { getProjection, rowsForDrag, toProjectionRows } from './projection'
import { MODULE_TYPES_BY_ID } from './fixtures/module-types'

const INDENT = 28

function doc(clusters: [string, number][], modules: [string, number, string | null][]): DayDoc {
  return {
    id: 'd',
    workshopId: 'w',
    title: 'Tag',
    date: null,
    startMinute: 540,
    targetEndMinute: null,
    desc: {},
    clusters: clusters.map(([id, order]) => ({
      id,
      parentClusterId: null,
      mode: 'sequential' as const,
      title: id,
      color: null,
      pinnedStartMinute: null,
      collapsed: false,
      targetDurationMinutes: null,
      order,
    })),
    modules: modules.map(([id, order, clusterId]) => ({
      id,
      clusterId,
      moduleTypeId: 'mt-break',
      title: id,
      durationMinutes: 15,
      pinnedStartMinute: null,
      desc: {},
      parked: false,
      responsible: [],
      order,
    })),
    moduleTypes: MODULE_TYPES_BY_ID,
  }
}

/** Runs a full drag: project, then apply. */
function drag(d: DayDoc, activeId: string, overId: string, offsetX = 0) {
  const rows = rowsForDrag(toProjectionRows(flattenDay(d)), activeId)
  return applyMove(d, activeId, getProjection(rows, activeId, overId, offsetX, INDENT))
}

const shape = (d: DayDoc) => flattenDay(d).map((r) => (r.depth === 1 ? `  ${r.id}` : r.id))

describe('applyMove', () => {
  it('reorders two day-level modules', () => {
    const d = doc(
      [],
      [
        ['a', 0, null],
        ['b', 1, null],
        ['c', 2, null],
      ],
    )
    expect(shape(drag(d, 'a', 'c'))).toEqual(['b', 'c', 'a'])
  })

  it('moves a module into a cluster', () => {
    const d = doc(
      [['c1', 1]],
      [
        ['a', 0, null],
        ['x', 0, 'c1'],
      ],
    )
    expect(shape(drag(d, 'a', 'c1', INDENT))).toEqual(['c1', '  a', '  x'])
  })

  it('moves a module out of a cluster onto the day', () => {
    const d = doc(
      [['c1', 0]],
      [
        ['a', 0, 'c1'],
        ['b', 1, 'c1'],
        ['z', 1, null],
      ],
    )
    const after = drag(d, 'b', 'z', -INDENT)
    // Dragging downward onto a row lands BEHIND it -- see the asymmetry test below.
    expect(shape(after)).toEqual(['c1', '  a', 'z', 'b'])
    expect(after.modules.find((m) => m.id === 'b')?.clusterId).toBeNull()
  })

  it('lands behind the target when dragged down and in front of it when dragged up', () => {
    // Standard sortable-list semantics, and surprising often enough to pin down:
    // the drop position is the target's index in the reordered list, so the
    // direction of travel decides which side of the target you end up on.
    const d = doc(
      [],
      [
        ['a', 0, null],
        ['b', 1, null],
        ['c', 2, null],
      ],
    )
    expect(shape(drag(d, 'a', 'b'))).toEqual(['b', 'a', 'c'])
    expect(shape(drag(d, 'c', 'b'))).toEqual(['a', 'c', 'b'])
  })

  it('moves a module between two clusters', () => {
    const d = doc(
      [
        ['c1', 0],
        ['c2', 1],
      ],
      [
        ['a', 0, 'c1'],
        ['b', 0, 'c2'],
      ],
    )
    const after = drag(d, 'a', 'b')
    expect(after.modules.find((m) => m.id === 'a')?.clusterId).toBe('c2')
  })

  it('carries a cluster’s children with it', () => {
    const d = doc(
      [
        ['c1', 0],
        ['c2', 3],
      ],
      [
        ['a', 0, 'c1'],
        ['b', 1, 'c1'],
        ['z', 2, null],
        ['q', 0, 'c2'],
      ],
    )
    expect(shape(drag(d, 'c1', 'c2'))).toEqual(['z', 'c2', '  q', 'c1', '  a', '  b'])
  })

  it('leaves the document untouched for an invalid projection', () => {
    const d = doc(
      [],
      [
        ['a', 0, null],
        ['b', 1, null],
      ],
    )
    expect(
      applyMove(d, 'a', { depth: 0, parentId: null, index: -1, afterId: null, valid: false }),
    ).toBe(d)
  })

  it('produces gapless orders per parent so repeated moves cannot drift', () => {
    let d = doc(
      [['c1', 0]],
      [
        ['a', 0, 'c1'],
        ['b', 1, 'c1'],
        ['z', 1, null],
      ],
    )
    for (let i = 0; i < 20; i++) {
      d = drag(d, 'a', 'z', -INDENT)
      d = drag(d, 'a', 'b', INDENT)
    }
    const childOrders = d.modules
      .filter((m) => m.clusterId === 'c1')
      .map((m) => m.order)
      .sort()
    expect(childOrders).toEqual([0, 1])
    const dayOrders = [
      ...d.clusters.map((c) => c.order),
      ...d.modules.filter((m) => !m.clusterId).map((m) => m.order),
    ].sort()
    expect(dayOrders).toEqual([0, 1])
  })
})

/**
 * A breakout moves as a whole: strands and the blocks inside them. The bug this
 * guards against is quiet -- a drag that looks right on screen and leaves the
 * work of three groups sitting loose on the day.
 */
describe('applyMove / breakouts', () => {
  type C = { id: string; order: number; parent?: string | null; mode?: 'parallel' | 'sequential' }

  const breakoutDoc = (clusters: C[], modules: [string, number, string | null][]): DayDoc => {
    const base = doc([], modules)
    return {
      ...base,
      clusters: clusters.map((c) => ({
        id: c.id,
        parentClusterId: c.parent ?? null,
        mode: c.mode ?? ('sequential' as const),
        title: c.id,
        color: null,
        pinnedStartMinute: null,
        collapsed: false,
        targetDurationMinutes: null,
        order: c.order,
      })),
    }
  }

  /** bo[ s1[a1 a2] s2[b1] ] then a day-level block z. */
  const day = () =>
    breakoutDoc(
      [
        { id: 'bo', order: 0, mode: 'parallel' },
        { id: 's1', order: 0, parent: 'bo' },
        { id: 's2', order: 1, parent: 'bo' },
      ],
      [
        ['a1', 0, 's1'],
        ['a2', 1, 's1'],
        ['b1', 0, 's2'],
        ['z', 1, null],
      ],
    )

  const move = (source: DayDoc, activeId: string, overId: string, offsetX = 0) => {
    const rows = rowsForDrag(toProjectionRows(flattenDay(source)), activeId)
    return applyMove(source, activeId, getProjection(rows, activeId, overId, offsetX, INDENT))
  }

  const shape = (d: DayDoc) =>
    flattenDay(d).map((r) => [r.id, r.depth, r.parentId] as [string, number, string | null])

  it('numbers each strand’s blocks among themselves, starting at 0', () => {
    expect(
      day()
        .modules.filter((m) => m.clusterId === 's1')
        .map((m) => m.order),
    ).toEqual([0, 1])
    // Dragged upwards onto b1, so it lands in front of it -- and the strand is
    // renumbered from 0 among its own blocks, not from anywhere in the day.
    const after = move(day(), 'z', 'b1')
    expect(after.modules.filter((m) => m.clusterId === 's2').map((m) => [m.id, m.order])).toEqual([
      ['z', 0],
      ['b1', 1],
    ])
    // The other strand is untouched, which is what "parallel" has to mean here.
    expect(after.modules.filter((m) => m.clusterId === 's1').map((m) => m.order)).toEqual([0, 1])
  })

  it('takes a strand out to the day with its blocks', () => {
    const after = move(day(), 's1', 'z')
    const strand = after.clusters.find((c) => c.id === 's1')!
    expect(strand.parentClusterId).toBeNull()
    expect(after.modules.filter((m) => m.clusterId === 's1').map((m) => m.id)).toEqual(['a1', 'a2'])
    // It became an ordinary section: its blocks sit one level in, not two.
    expect(shape(after)).toContainEqual(['a1', 1, 's1'])
  })

  it('takes a section into a breakout as a strand, blocks and all', () => {
    const source = breakoutDoc(
      [
        { id: 'bo', order: 0, mode: 'parallel' },
        { id: 's1', order: 0, parent: 'bo' },
        { id: 'sec', order: 1 },
      ],
      [
        ['a1', 0, 's1'],
        ['q1', 0, 'sec'],
        ['q2', 1, 'sec'],
      ],
    )
    const after = move(source, 'sec', 's1')
    expect(after.clusters.find((c) => c.id === 'sec')!.parentClusterId).toBe('bo')
    expect(after.modules.filter((m) => m.clusterId === 'sec').map((m) => m.id)).toEqual([
      'q1',
      'q2',
    ])
    expect(shape(after)).toContainEqual(['q1', 2, 'sec'])
  })

  it('moves a whole breakout with its strands and every block in them', () => {
    const source = breakoutDoc(
      [
        { id: 'top', order: 0 },
        { id: 'bo', order: 1, mode: 'parallel' },
        { id: 's1', order: 0, parent: 'bo' },
        { id: 's2', order: 1, parent: 'bo' },
      ],
      [
        ['t1', 0, 'top'],
        ['a1', 0, 's1'],
        ['b1', 0, 's2'],
      ],
    )
    const after = move(source, 'bo', 't1')

    // Nothing fell out: the shape is identical, only the position changed.
    expect(after.clusters.find((c) => c.id === 's1')!.parentClusterId).toBe('bo')
    expect(after.modules.find((m) => m.id === 'a1')!.clusterId).toBe('s1')
    expect(after.modules.find((m) => m.id === 'b1')!.clusterId).toBe('s2')
    expect(
      shape(after)
        .filter(([, d]) => d === 2)
        .map(([id]) => id),
    ).toEqual(['a1', 'b1'])
  })

  it('keeps the strand order when one is dragged past another', () => {
    const after = move(day(), 's2', 's1')
    const strands = after.clusters
      .filter((c) => c.parentClusterId === 'bo')
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id)
    expect(strands).toEqual(['s2', 's1'])
  })
})
