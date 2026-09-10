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
    clusters: clusters.map(([id, order]) => ({
      id,
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
