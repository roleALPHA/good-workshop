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
