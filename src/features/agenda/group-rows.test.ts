import { describe, expect, it } from 'vitest'
import type { ClusterDto, DayDoc, ModuleDto } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { flattenDay, toScheduleItems, withGapRows } from './flatten'
import { groupBreakouts } from './group-rows'
import { MODULE_TYPES_BY_ID } from './fixtures/module-types'

const cluster = (id: string, order: number, extra: Partial<ClusterDto> = {}): ClusterDto => ({
  id,
  parentClusterId: null,
  mode: 'sequential',
  title: id,
  color: null,
  pinnedStartMinute: null,
  collapsed: false,
  targetDurationMinutes: null,
  order,
  ...extra,
})

const mod = (
  id: string,
  order: number,
  clusterId: string | null = null,
  extra: Partial<ModuleDto> = {},
): ModuleDto => ({
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
  ...extra,
})

const day = (clusters: ClusterDto[], modules: ModuleDto[]): DayDoc => ({
  id: 'd',
  workshopId: 'w',
  title: 'Tag',
  date: null,
  startMinute: 540,
  targetEndMinute: null,
  desc: {},
  clusters,
  modules,
  moduleTypes: MODULE_TYPES_BY_ID,
})

const shape = (nodes: ReturnType<typeof groupBreakouts>) =>
  nodes.map((n) =>
    n.kind === 'row' ? n.row.id : [n.id, n.strands.map((s) => [s.id, s.rows.map((r) => r.id)])],
  )

describe('groupBreakouts', () => {
  it('leaves an ordinary day completely alone', () => {
    const rows = flattenDay(day([cluster('c', 0)], [mod('a', 0, 'c'), mod('z', 1)]))
    expect(shape(groupBreakouts(rows))).toEqual(['c', 'a', 'z'])
  })

  it('folds a breakout, its strands and their blocks into one node', () => {
    const rows = flattenDay(
      day(
        [
          cluster('bo', 0, { mode: 'parallel' }),
          cluster('s1', 0, { parentClusterId: 'bo' }),
          cluster('s2', 1, { parentClusterId: 'bo' }),
        ],
        [mod('a1', 0, 's1'), mod('a2', 1, 's1'), mod('b1', 0, 's2'), mod('z', 1)],
      ),
    )
    expect(shape(groupBreakouts(rows))).toEqual([
      [
        'bo',
        [
          ['s1', ['a1', 'a2']],
          ['s2', ['b1']],
        ],
      ],
      'z',
    ])
  })

  it('keeps an empty breakout, and an empty strand inside it', () => {
    const rows = flattenDay(
      day(
        [cluster('bo', 0, { mode: 'parallel' }), cluster('s1', 0, { parentClusterId: 'bo' })],
        [],
      ),
    )
    expect(shape(groupBreakouts(rows))).toEqual([['bo', [['s1', []]]]])
  })

  it('carries a gap row into the strand it interrupts', () => {
    const doc = day(
      [cluster('bo', 0, { mode: 'parallel' }), cluster('s1', 0, { parentClusterId: 'bo' })],
      [mod('a', 0, 's1', { durationMinutes: 10 }), mod('b', 1, 's1', { pinnedStartMinute: 600 })],
    )
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    const nodes = groupBreakouts(withGapRows(rows, schedule))
    const breakout = nodes[0]
    expect(breakout?.kind).toBe('breakout')
    if (breakout?.kind !== 'breakout') return
    expect(breakout.strands[0]!.rows.map((r) => r.id)).toEqual(['a', 'gap-before-b', 'b'])
  })

  it('does not swallow the row after the breakout', () => {
    const rows = flattenDay(
      day(
        [cluster('bo', 0, { mode: 'parallel' }), cluster('s1', 0, { parentClusterId: 'bo' })],
        [mod('a', 0, 's1'), mod('z', 1)],
      ),
    )
    expect(shape(groupBreakouts(rows)).at(-1)).toBe('z')
  })

  it('falls back to a plain row rather than throwing on a shape it cannot read', () => {
    // A depth-2 row with no strand above it. Not producible by flattenDay, but
    // a document can hold it for a moment -- and it must stay readable.
    const rows = flattenDay(day([cluster('bo', 0, { mode: 'parallel' })], []))
    const broken = [
      ...rows,
      {
        kind: 'module' as const,
        id: 'loose',
        depth: 2 as const,
        parentId: 'gone',
        module: mod('loose', 0),
      },
    ]
    expect(() => groupBreakouts(broken)).not.toThrow()
    expect(shape(groupBreakouts(broken)).at(-1)).toBe('loose')
  })
})
