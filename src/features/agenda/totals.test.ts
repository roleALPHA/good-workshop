import { describe, expect, it } from 'vitest'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import type { ClusterDto, DayDoc, ModuleDto } from '@/domain/agenda/types'
import { flattenDay, toScheduleItems } from './flatten'
import { dayTotals } from './totals'

const TYPES = {
  work: { id: 'work', key: 'work', countsAsContent: true },
  pause: { id: 'pause', key: 'pause', countsAsContent: false },
} as unknown as DayDoc['moduleTypes']

const mod = (
  id: string,
  order: number,
  clusterId: string | null,
  durationMinutes: number,
  typeId: 'work' | 'pause' = 'work',
  parked = false,
): ModuleDto => ({
  id,
  clusterId,
  moduleTypeId: typeId,
  title: id,
  durationMinutes,
  pinnedStartMinute: null,
  desc: {},
  parked,
  responsible: [],
  order,
})

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
  moduleTypes: TYPES,
})

const totalsOf = (doc: DayDoc) =>
  dayTotals(doc, computeSchedule(doc.startMinute, toScheduleItems(flattenDay(doc))))

describe('dayTotals', () => {
  it('splits content from breaks', () => {
    const doc = day([], [mod('a', 0, null, 60), mod('b', 1, null, 15, 'pause')])
    expect(totalsOf(doc)).toEqual({ content: 60, breaks: 15, blocks: 2 })
  })

  it('leaves a parked block out of the day it is not part of', () => {
    // It used to be counted, which made "content plus breaks" larger than the
    // day it described.
    const doc = day([], [mod('a', 0, null, 60), mod('gone', 1, null, 120, 'work', true)])
    expect(totalsOf(doc)).toEqual({ content: 60, breaks: 0, blocks: 1 })
  })

  it('counts only the strand that sets a breakout’s wall clock', () => {
    const doc = day(
      [
        cluster('bo', 0, { mode: 'parallel' }),
        cluster('s1', 0, { parentClusterId: 'bo' }),
        cluster('s2', 1, { parentClusterId: 'bo' }),
      ],
      [mod('long', 0, 's1', 90), mod('short', 0, 's2', 20)],
    )
    expect(totalsOf(doc)).toEqual({ content: 90, breaks: 0, blocks: 1 })
  })

  it('keeps content plus breaks equal to end minus start across a breakout', () => {
    const doc = day(
      [
        cluster('bo', 0, { mode: 'parallel' }),
        cluster('s1', 0, { parentClusterId: 'bo' }),
        cluster('s2', 1, { parentClusterId: 'bo' }),
      ],
      [
        mod('a', 0, 's1', 45),
        mod('b', 1, 's1', 15, 'pause'),
        mod('c', 0, 's2', 30),
        mod('after', 0, null, 10, 'pause'),
      ],
    )
    const schedule = computeSchedule(doc.startMinute, toScheduleItems(flattenDay(doc)))
    const { content, breaks } = dayTotals(doc, schedule)
    expect(content + breaks).toBe(schedule.dayEndMinute - schedule.dayStartMinute)
  })

  it('says nothing about an empty day', () => {
    expect(totalsOf(day([], []))).toEqual({ content: 0, breaks: 0, blocks: 0 })
  })
})
