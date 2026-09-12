import { describe, expect, it } from 'vitest'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import type { ClusterDto, DayDoc, ModuleDto } from '@/domain/agenda/types'
import { flattenDay, toScheduleItems, withGapRows } from './flatten'
import { createDemoDay, createStressDay } from './fixtures/day-fixture'
import { MODULE_TYPES_BY_ID } from './fixtures/module-types'

const cluster = (id: string, order: number, extra: Partial<ClusterDto> = {}): ClusterDto => ({
  id,
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

describe('flattenDay', () => {
  it('returns nothing for an empty day', () => {
    expect(flattenDay(day([], []))).toEqual([])
  })

  it('merges clusters and day-level modules into one ordered list', () => {
    const rows = flattenDay(day([cluster('c1', 1)], [mod('m0', 0), mod('m2', 2)]))
    expect(rows.map((r) => r.id)).toEqual(['m0', 'c1', 'm2'])
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 0])
  })

  it('nests cluster children at depth 1 directly after their cluster', () => {
    const rows = flattenDay(
      day([cluster('c1', 0)], [mod('a', 0, 'c1'), mod('b', 1, 'c1'), mod('z', 1)]),
    )
    expect(rows.map((r) => [r.id, r.depth, r.parentId])).toEqual([
      ['c1', 0, null],
      ['a', 1, 'c1'],
      ['b', 1, 'c1'],
      ['z', 0, null],
    ])
  })

  it('keeps an empty cluster in the list', () => {
    const rows = flattenDay(day([cluster('c1', 0)], []))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'cluster', childCount: 0 })
  })

  it('hides children of a collapsed cluster but keeps the child count', () => {
    const doc = day([cluster('c1', 0)], [mod('a', 0, 'c1'), mod('b', 1, 'c1')])
    const rows = flattenDay(doc, { collapsed: new Set(['c1']) })
    expect(rows.map((r) => r.id)).toEqual(['c1'])
    expect(rows[0]).toMatchObject({ kind: 'cluster', childCount: 2 })
  })

  it('breaks ties on equal order deterministically by id', () => {
    const a = flattenDay(day([cluster('c-b', 0)], [mod('m-a', 0)]))
    const b = flattenDay(day([cluster('c-b', 0)], [mod('m-a', 0)]))
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id))
    expect(a.map((r) => r.id)).toEqual(['c-b', 'm-a'])
  })

  it('ignores modules pointing at a cluster that is not on this day', () => {
    const rows = flattenDay(day([], [mod('orphan', 0, 'missing-cluster')]))
    expect(rows).toEqual([])
  })
})

describe('toScheduleItems', () => {
  it('gives clusters zero duration and carries the parent onto modules', () => {
    const rows = flattenDay(day([cluster('c1', 0)], [mod('a', 0, 'c1', { durationMinutes: 20 })]))
    expect(toScheduleItems(rows)).toEqual([
      { id: 'c1', kind: 'cluster', clusterId: null, durationMinutes: 0, pinnedStartMinute: null },
      { id: 'a', kind: 'module', clusterId: 'c1', durationMinutes: 20, pinnedStartMinute: null },
    ])
  })
})

describe('withGapRows', () => {
  it('inserts a derived gap row before the block that opens it', () => {
    const doc = day(
      [],
      [mod('a', 0, null, { durationMinutes: 30 }), mod('b', 1, null, { pinnedStartMinute: 600 })],
    )
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    const withGaps = withGapRows(rows, schedule)

    expect(withGaps.map((r) => r.id)).toEqual(['a', 'gap-before-b', 'b'])
    expect(withGaps[1]).toMatchObject({ kind: 'gap', minutes: 30, beforeRowId: 'b' })
  })

  it('does not insert a gap for an overlap', () => {
    const doc = day(
      [],
      [mod('a', 0, null, { durationMinutes: 90 }), mod('b', 1, null, { pinnedStartMinute: 600 })],
    )
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    expect(withGapRows(rows, schedule).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('fixtures', () => {
  it('the demo day schedules from its pinned 13:00 start', () => {
    const doc = createDemoDay()
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    expect(schedule.entries.get('m-1')?.startMinute).toBe(13 * 60)
    expect(schedule.entries.get('m-1')?.pinned).toBe(true)
  })

  it('the demo day surfaces the pinned lunch as a real conflict rather than hiding it', () => {
    const doc = createDemoDay()
    const rows = flattenDay(doc)
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
    const lunch = schedule.entries.get('m-7')
    expect(lunch?.startMinute).toBe(14 * 60 + 30)
    expect(lunch?.conflict).not.toBeNull()
  })

  it('the stress fixture produces the requested row count and is deterministic', () => {
    const a = createStressDay(150)
    const b = createStressDay(150)
    expect(a.clusters.length + a.modules.length).toBe(150)
    expect(flattenDay(a)).toHaveLength(150)
    expect(flattenDay(a).map((r) => r.id)).toEqual(flattenDay(b).map((r) => r.id))
  })
})
