import { describe, expect, it } from 'vitest'
import type { ClusterDto, DayDoc, ModuleDto } from '@/domain/agenda/types'
import { flattenDay } from './flatten'
import { insertSlot } from './insert-slot'
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

const mod = (id: string, order: number, clusterId: string | null = null): ModuleDto => ({
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
})

/**
 *   a
 *   K          (section)
 *     x
 *     y
 *   E          (empty section)
 *   BO         (breakout)
 *     S1       (strand)
 *       s
 *   b
 */
const rows = flattenDay({
  id: 'd',
  workshopId: 'w',
  title: 'Tag',
  date: null,
  startMinute: 540,
  targetEndMinute: null,
  desc: {},
  clusters: [
    cluster('K', 1),
    cluster('E', 2),
    cluster('BO', 3, { mode: 'parallel' }),
    cluster('S1', 0, { parentClusterId: 'BO' }),
  ],
  modules: [mod('a', 0), mod('x', 0, 'K'), mod('y', 1, 'K'), mod('s', 0, 'S1'), mod('b', 4)],
  moduleTypes: MODULE_TYPES_BY_ID,
} satisfies DayDoc)

describe('insertSlot', () => {
  it('opens the day at the top', () => {
    expect(insertSlot(rows, null)).toEqual({
      key: 'start',
      anchor: null,
      depth: 0,
      block: { parentId: null, afterId: null },
      section: { afterId: null },
    })
  })

  it('after a day-level block offers everything, behind that block', () => {
    expect(insertSlot(rows, 'a')).toMatchObject({
      anchor: 'a',
      depth: 0,
      block: { parentId: null, afterId: 'a' },
      section: { afterId: 'a' },
    })
  })

  it('under a section header puts a block first in the section, and no section', () => {
    expect(insertSlot(rows, 'K')).toMatchObject({
      depth: 1,
      block: { parentId: 'K', afterId: null },
      section: null,
    })
  })

  it('between two blocks of a section stays inside it', () => {
    expect(insertSlot(rows, 'x')).toMatchObject({
      depth: 1,
      block: { parentId: 'K', afterId: 'x' },
      section: null,
    })
  })

  it('after the last block of a section: a block joins it, a section follows it', () => {
    expect(insertSlot(rows, 'y')).toMatchObject({
      depth: 1,
      block: { parentId: 'K', afterId: 'y' },
      section: { afterId: 'K' },
    })
  })

  it('under an empty section: a block goes in, a section goes after it', () => {
    expect(insertSlot(rows, 'E')).toMatchObject({
      depth: 1,
      block: { parentId: 'E', afterId: null },
      section: { afterId: 'E' },
    })
  })

  it('after a breakout everything lands on the day behind it', () => {
    expect(insertSlot(rows, 'BO')).toMatchObject({
      depth: 0,
      block: { parentId: null, afterId: 'BO' },
      section: { afterId: 'BO' },
    })
  })

  it('has no line inside a breakout -- strands carry their own button', () => {
    expect(insertSlot(rows, 'S1')).toBeNull()
    expect(insertSlot(rows, 's')).toBeNull()
  })

  it('has no line for a row that is not there', () => {
    expect(insertSlot(rows, 'weg')).toBeNull()
  })
})
