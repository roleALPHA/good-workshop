import { describe, expect, it } from 'vitest'
import { createDemoDay } from './fixtures/day-fixture'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { flattenDay, toScheduleItems } from './flatten'

/**
 * Parking a block takes it out of the schedule without taking it out of the day.
 *
 * The rule lives in flattenDay, on purpose: every consumer -- the table, the
 * export, the running totals, the print view -- reads those rows, and one that
 * forgot to filter would show a plan whose times do not add up.
 */

const park = (titles: string[]) => {
  const doc = createDemoDay()
  return {
    ...doc,
    modules: doc.modules.map((m) => (titles.includes(m.title) ? { ...m, parked: true } : m)),
  }
}

const endOf = (doc: ReturnType<typeof createDemoDay>) => {
  const rows = flattenDay(doc)
  const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
  return { rows, schedule }
}

describe('a parked block', () => {
  it('disappears from the rows the agenda is built from', () => {
    const before = endOf(createDemoDay()).rows.length
    const after = endOf(park(['Druckpunkte'])).rows

    expect(after.length).toBe(before - 1)
    expect(after.some((row) => row.kind === 'module' && row.module.title === 'Druckpunkte')).toBe(
      false,
    )
  })

  it('stops counting towards the content total', () => {
    const withIt = endOf(createDemoDay())
    const without = endOf(park(['Druckpunkte']))

    // 'Druckpunkte' runs 45 minutes. The total is what the summary reports and
    // what "30m über Plan" is measured against.
    expect(without.schedule.totalDurationMinutes).toBe(withIt.schedule.totalDurationMinutes - 45)
  })

  it('pulls the end of the day in when it sat after the last pinned block', () => {
    const withIt = endOf(createDemoDay())
    const without = endOf(park(['Check-out']))

    expect(without.schedule.dayEndMinute).toBe(withIt.schedule.dayEndMinute - 15)
  })

  it('leaves the end alone when a pinned block sits between it and the end', () => {
    // Parking 'Druckpunkte' opens a gap before the pinned lunch rather than
    // moving everything up -- the pin is the fixed point, which is the whole
    // reason pinning exists. Worth stating: it is the first thing somebody
    // assumes wrongly about parking.
    const withIt = endOf(createDemoDay())
    const without = endOf(park(['Druckpunkte']))

    expect(without.schedule.dayEndMinute).toBe(withIt.schedule.dayEndMinute)
  })

  it('stays in the document, so it can come back', () => {
    const doc = park(['Druckpunkte'])
    const parked = doc.modules.filter((m) => m.parked)

    expect(parked).toHaveLength(1)
    // With everything about it intact -- this is not a deletion.
    expect(parked[0]).toMatchObject({ title: 'Druckpunkte', durationMinutes: 45 })
    expect(parked[0]?.desc).toEqual(doc.modules.find((m) => m.title === 'Druckpunkte')?.desc)
  })

  it('takes a cluster child out of its cluster count', () => {
    const before = endOf(createDemoDay())
    const after = endOf(park(['Energizer: Zwei Wahrheiten']))

    const section = (s: typeof before) =>
      s.rows.find((row) => row.kind === 'cluster' && row.cluster.title === 'Ankommen & Rahmen')

    const clusterBefore = section(before)
    const clusterAfter = section(after)
    expect(clusterBefore?.kind === 'cluster' && clusterBefore.childCount).toBe(3)
    expect(clusterAfter?.kind === 'cluster' && clusterAfter.childCount).toBe(2)
  })
})
