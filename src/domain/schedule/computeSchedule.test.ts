import { describe, expect, it } from 'vitest'
import { computeSchedule } from './computeSchedule'
import type { ScheduleItem } from './types'

const H = (h: number, m = 0) => h * 60 + m

const mod = (
  id: string,
  durationMinutes: number,
  opts: { clusterId?: string | null; pin?: number | null } = {},
): ScheduleItem => ({
  id,
  kind: 'module',
  clusterId: opts.clusterId ?? null,
  durationMinutes,
  pinnedStartMinute: opts.pin ?? null,
})

const cluster = (id: string, pin: number | null = null): ScheduleItem => ({
  id,
  kind: 'cluster',
  clusterId: null,
  durationMinutes: 0,
  pinnedStartMinute: pin,
})

describe('computeSchedule', () => {
  it('returns an empty schedule for an empty day', () => {
    const s = computeSchedule(H(9), [])
    expect(s.entries.size).toBe(0)
    expect(s.dayStartMinute).toBe(H(9))
    expect(s.dayEndMinute).toBe(H(9))
    expect(s.totalDurationMinutes).toBe(0)
  })

  it('chains unpinned blocks from the day start', () => {
    const s = computeSchedule(H(9), [mod('a', 15), mod('b', 45), mod('c', 30)])
    expect(s.entries.get('a')).toMatchObject({ startMinute: H(9), endMinute: H(9, 15) })
    expect(s.entries.get('b')).toMatchObject({ startMinute: H(9, 15), endMinute: H(10) })
    expect(s.entries.get('c')).toMatchObject({ startMinute: H(10), endMinute: H(10, 30) })
    expect(s.dayEndMinute).toBe(H(10, 30))
    expect(s.totalDurationMinutes).toBe(90)
  })

  it('honours a pin on the first block regardless of the day start', () => {
    // The reference screenshot: a lock on the first block at 13:00.
    const s = computeSchedule(H(9), [mod('a', 15, { pin: H(13) }), mod('b', 45)])
    expect(s.entries.get('a')).toMatchObject({
      startMinute: H(13),
      endMinute: H(13, 15),
      pinned: true,
    })
    expect(s.entries.get('b')).toMatchObject({ startMinute: H(13, 15), endMinute: H(14) })
  })

  it('reports a gap when a pin sits after the running cursor', () => {
    const s = computeSchedule(H(9), [mod('a', 30), mod('b', 30, { pin: H(10) })])
    expect(s.entries.get('b')?.conflict).toEqual({ kind: 'gap', minutes: 30 })
    expect(s.entries.get('b')?.startMinute).toBe(H(10))
  })

  it('reports an overlap when a pin sits before the running cursor, without shortening anything', () => {
    const s = computeSchedule(H(9), [mod('a', 90), mod('b', 30, { pin: H(10) })])
    expect(s.entries.get('a')).toMatchObject({ endMinute: H(10, 30), durationMinutes: 90 })
    expect(s.entries.get('b')).toMatchObject({
      startMinute: H(10),
      conflict: { kind: 'overlap', minutes: 30 },
    })
  })

  it('lets a later block recover after an overlap', () => {
    const s = computeSchedule(H(9), [mod('a', 90), mod('b', 30, { pin: H(10) }), mod('c', 15)])
    expect(s.entries.get('c')).toMatchObject({ startMinute: H(10, 30), endMinute: H(10, 45) })
  })

  it('derives a cluster start and duration from its children', () => {
    const s = computeSchedule(H(9), [
      cluster('c1'),
      mod('a', 20, { clusterId: 'c1' }),
      mod('b', 25, { clusterId: 'c1' }),
      mod('z', 10),
    ])
    expect(s.entries.get('c1')).toMatchObject({
      startMinute: H(9),
      endMinute: H(9, 45),
      durationMinutes: 45,
    })
    expect(s.entries.get('z')).toMatchObject({ startMinute: H(9, 45) })
  })

  it("reflects an internal gap in the cluster's derived duration", () => {
    const s = computeSchedule(H(9), [
      cluster('c1'),
      mod('a', 20, { clusterId: 'c1' }),
      mod('b', 25, { clusterId: 'c1', pin: H(10) }),
    ])
    // 09:00-09:20, then a 40 min gap, then 10:00-10:25 => derived duration 85.
    expect(s.entries.get('c1')).toMatchObject({
      startMinute: H(9),
      endMinute: H(10, 25),
      durationMinutes: 85,
    })
  })

  it("moves the cursor to a cluster's own pin before its first child", () => {
    const s = computeSchedule(H(9), [
      mod('a', 15),
      cluster('c1', H(11)),
      mod('b', 30, { clusterId: 'c1' }),
    ])
    expect(s.entries.get('c1')).toMatchObject({ startMinute: H(11), pinned: true })
    expect(s.entries.get('b')).toMatchObject({ startMinute: H(11), endMinute: H(11, 30) })
  })

  it('gives an empty cluster a zero-length entry at the cursor', () => {
    const s = computeSchedule(H(9), [mod('a', 15), cluster('c1'), mod('b', 15)])
    expect(s.entries.get('c1')).toMatchObject({
      startMinute: H(9, 15),
      endMinute: H(9, 15),
      durationMinutes: 0,
    })
    expect(s.entries.get('b')).toMatchObject({ startMinute: H(9, 15) })
  })

  it('runs past midnight without wrapping', () => {
    const s = computeSchedule(H(20), [mod('a', 120), mod('b', 180)])
    expect(s.entries.get('b')).toMatchObject({ startMinute: H(22), endMinute: H(25) })
    expect(s.dayEndMinute).toBe(H(25))
  })

  it('rolls a pin that falls before the day start to the next day', () => {
    // Evening session starting 20:00, a block pinned to 01:00 means 01:00 *tomorrow*.
    const s = computeSchedule(H(20), [mod('a', 60), mod('b', 30, { pin: H(1) })])
    expect(s.entries.get('b')?.startMinute).toBe(H(25))
    expect(s.entries.get('b')?.conflict).toEqual({ kind: 'gap', minutes: 240 })
  })

  it('handles zero-duration modules as markers without moving the cursor', () => {
    const s = computeSchedule(H(9), [mod('a', 15), mod('note', 0), mod('b', 15)])
    expect(s.entries.get('note')).toMatchObject({ startMinute: H(9, 15), endMinute: H(9, 15) })
    expect(s.entries.get('b')).toMatchObject({ startMinute: H(9, 15), endMinute: H(9, 30) })
  })

  it('excludes gap time from totalDurationMinutes', () => {
    const s = computeSchedule(H(9), [mod('a', 30), mod('b', 30, { pin: H(10) })])
    expect(s.totalDurationMinutes).toBe(60)
    expect(s.dayEndMinute).toBe(H(10, 30))
  })

  it('is stable when called twice with the same input', () => {
    const items = [cluster('c1'), mod('a', 20, { clusterId: 'c1' }), mod('b', 10)]
    expect(computeSchedule(H(9), items).entries).toEqual(computeSchedule(H(9), items).entries)
  })
})

describe('computeSchedule / cluster start derivation', () => {
  it('takes the cluster start from its first child even when that child is pinned', () => {
    const s = computeSchedule(H(9), [
      mod('a', 15),
      cluster('c1'),
      mod('b', 25, { clusterId: 'c1', pin: H(10) }),
      mod('c', 20, { clusterId: 'c1' }),
    ])
    expect(s.entries.get('c1')).toMatchObject({
      startMinute: H(10),
      endMinute: H(10, 45),
      durationMinutes: 45,
    })
  })
})

/**
 * A breakout: a container whose children are strands that run at the same time.
 *
 * Two things are deliberately NOT conflicts here, and the tests say so out
 * loud: that two strands overlap each other (that is the entire point), and
 * that one finishes before another (groups work at different speeds). A
 * conflict only arises inside a strand, against that strand's own clock.
 */
const strand = (id: string, parentId: string, pin: number | null = null): ScheduleItem => ({
  id,
  kind: 'cluster',
  clusterId: parentId,
  durationMinutes: 0,
  pinnedStartMinute: pin,
  mode: 'sequential',
})

const breakout = (id: string, pin: number | null = null): ScheduleItem => ({
  id,
  kind: 'cluster',
  clusterId: null,
  durationMinutes: 0,
  pinnedStartMinute: pin,
  mode: 'parallel',
})

describe('computeSchedule / breakouts', () => {
  /** A breakout at 09:00 with strands of 45m, 20m and 45m. */
  const threeStrands = (): ScheduleItem[] => [
    breakout('bo'),
    strand('s1', 'bo'),
    mod('a1', 25, { clusterId: 's1' }),
    mod('a2', 20, { clusterId: 's1' }),
    strand('s2', 'bo'),
    mod('b1', 20, { clusterId: 's2' }),
    strand('s3', 'bo'),
    mod('c1', 45, { clusterId: 's3' }),
  ]

  it('starts every strand when the breakout starts', () => {
    const s = computeSchedule(H(9), threeStrands())
    for (const id of ['s1', 's2', 's3', 'a1', 'b1', 'c1']) {
      expect(s.entries.get(id)?.startMinute, id).toBe(H(9))
    }
  })

  it('runs the blocks inside one strand one after another', () => {
    const s = computeSchedule(H(9), threeStrands())
    expect(s.entries.get('a2')).toMatchObject({ startMinute: H(9, 25), endMinute: H(9, 45) })
  })

  it('ends the breakout with the longest strand, not the sum of them', () => {
    const s = computeSchedule(H(9), threeStrands())
    expect(s.entries.get('bo')).toMatchObject({
      startMinute: H(9),
      endMinute: H(9, 45),
      durationMinutes: 45,
    })
  })

  it('resumes the day after the longest strand', () => {
    const s = computeSchedule(H(9), [...threeStrands(), mod('pause', 15)])
    expect(s.entries.get('pause')?.startMinute).toBe(H(9, 45))
    expect(s.dayEndMinute).toBe(H(10))
  })

  it('does not call two overlapping strands a conflict', () => {
    const s = computeSchedule(H(9), threeStrands())
    for (const id of ['s1', 's2', 's3', 'b1', 'c1']) {
      expect(s.entries.get(id)?.conflict, id).toBeNull()
    }
  })

  it('counts only the strand that sets the wall clock towards the day total', () => {
    // 25 + 20 for s1, which is the longest. Counting all three would put 90
    // minutes of content into 45 minutes of day.
    const s = computeSchedule(H(9), threeStrands())
    expect(s.totalDurationMinutes).toBe(45)
    expect(s.entries.get('a1')?.countsTowardsTotals).toBe(true)
    expect(s.entries.get('a2')?.countsTowardsTotals).toBe(true)
    expect(s.entries.get('b1')?.countsTowardsTotals).toBe(false)
    expect(s.entries.get('c1')?.countsTowardsTotals).toBe(false)
  })

  it('keeps "content plus breaks equals end minus start" true across a breakout', () => {
    const s = computeSchedule(H(9), [...threeStrands(), mod('pause', 15)])
    expect(s.totalDurationMinutes).toBe(60)
    expect(s.dayEndMinute - s.dayStartMinute).toBe(60)
  })

  it('picks the first strand in document order when two end together', () => {
    const s = computeSchedule(H(9), [
      breakout('bo'),
      strand('s1', 'bo'),
      mod('a', 30, { clusterId: 's1' }),
      strand('s2', 'bo'),
      mod('b', 30, { clusterId: 's2' }),
    ])
    expect(s.entries.get('a')?.countsTowardsTotals).toBe(true)
    expect(s.entries.get('b')?.countsTowardsTotals).toBe(false)
  })

  it('gives an empty breakout a zero-length entry and leaves the clock alone', () => {
    const s = computeSchedule(H(9), [mod('a', 15), breakout('bo'), mod('b', 10)])
    expect(s.entries.get('bo')).toMatchObject({ startMinute: H(9, 15), durationMinutes: 0 })
    expect(s.entries.get('b')?.startMinute).toBe(H(9, 15))
  })

  it('spans the full strand when another is empty', () => {
    const s = computeSchedule(H(9), [
      breakout('bo'),
      strand('s1', 'bo'),
      mod('a', 40, { clusterId: 's1' }),
      strand('s2', 'bo'),
    ])
    expect(s.entries.get('bo')).toMatchObject({ endMinute: H(9, 40), durationMinutes: 40 })
  })

  it('moves every strand along when the breakout itself is pinned', () => {
    const s = computeSchedule(H(9), [
      mod('a', 15),
      breakout('bo', H(10)),
      strand('s1', 'bo'),
      mod('b', 30, { clusterId: 's1' }),
      strand('s2', 'bo'),
      mod('c', 20, { clusterId: 's2' }),
    ])
    expect(s.entries.get('bo')?.conflict).toEqual({ kind: 'gap', minutes: 45 })
    expect(s.entries.get('b')?.startMinute).toBe(H(10))
    expect(s.entries.get('c')?.startMinute).toBe(H(10))
  })

  it('lets a strand carry its own pin, measured against the breakout start', () => {
    const s = computeSchedule(H(9), [
      breakout('bo'),
      strand('s1', 'bo'),
      mod('a', 30, { clusterId: 's1' }),
      strand('s2', 'bo', H(9, 10)),
      mod('b', 20, { clusterId: 's2' }),
    ])
    expect(s.entries.get('s2')?.conflict).toEqual({ kind: 'gap', minutes: 10 })
    expect(s.entries.get('b')?.startMinute).toBe(H(9, 10))
    expect(s.entries.get('bo')).toMatchObject({ startMinute: H(9), endMinute: H(9, 30) })
  })

  it('keeps a gap inside one strand out of its neighbour', () => {
    const s = computeSchedule(H(9), [
      breakout('bo'),
      strand('s1', 'bo'),
      mod('a', 10, { clusterId: 's1' }),
      mod('b', 20, { clusterId: 's1', pin: H(9, 30) }),
      strand('s2', 'bo'),
      mod('c', 15, { clusterId: 's2' }),
    ])
    expect(s.entries.get('b')?.conflict).toEqual({ kind: 'gap', minutes: 20 })
    expect(s.entries.get('c')).toMatchObject({ startMinute: H(9), conflict: null })
    expect(s.entries.get('bo')?.endMinute).toBe(H(9, 50))
  })

  it('treats a block directly under a breakout like a one-block strand', () => {
    // Not a shape the editor can produce, but a document can hold it for a
    // moment. Showing it beats dropping it off the clock.
    const s = computeSchedule(H(9), [
      breakout('bo'),
      mod('a', 30, { clusterId: 'bo' }),
      strand('s1', 'bo'),
      mod('b', 50, { clusterId: 's1' }),
    ])
    expect(s.entries.get('a')?.startMinute).toBe(H(9))
    expect(s.entries.get('bo')?.endMinute).toBe(H(9, 50))
  })

  it('rolls a strand pin before the day start onto the next day', () => {
    const s = computeSchedule(H(20), [
      breakout('bo'),
      strand('s1', 'bo', H(1)),
      mod('a', 30, { clusterId: 's1' }),
    ])
    expect(s.entries.get('a')?.startMinute).toBe(H(25))
  })

  it('still places an item whose parent is not in the list', () => {
    const s = computeSchedule(H(9), [mod('a', 15, { clusterId: 'gone' }), mod('b', 10)])
    expect(s.entries.get('a')).toMatchObject({ startMinute: H(9), endMinute: H(9, 15) })
    expect(s.entries.get('b')?.startMinute).toBe(H(9, 15))
  })

  it('does not hang on a parent loop, and shows both of them', () => {
    const loopA: ScheduleItem = { ...breakout('x'), clusterId: 'y' }
    const loopB: ScheduleItem = { ...breakout('y'), clusterId: 'x' }
    const s = computeSchedule(H(9), [loopA, loopB])
    expect(s.entries.has('x')).toBe(true)
    expect(s.entries.has('y')).toBe(true)
  })

  it('is stable when called twice', () => {
    const items = threeStrands()
    expect(computeSchedule(H(9), items).entries).toEqual(computeSchedule(H(9), items).entries)
  })
})

describe('computeSchedule / regression', () => {
  it('resumes at the last child end after an internal overlap, while the cluster spans further', () => {
    // A quirk of the current walk that no test held: the day carries on at the
    // cursor (where the last child ended), while the cluster reaches to its
    // latest child. Written down so a later refactor does not "tidy" it away.
    const s = computeSchedule(H(9), [
      cluster('c1'),
      mod('a', 60, { clusterId: 'c1' }),
      mod('b', 10, { clusterId: 'c1', pin: H(9, 30) }),
      mod('after', 15),
    ])
    expect(s.entries.get('b')).toMatchObject({ startMinute: H(9, 30), endMinute: H(9, 40) })
    expect(s.entries.get('after')?.startMinute).toBe(H(9, 40))
    expect(s.entries.get('c1')?.endMinute).toBe(H(10))
  })
})
