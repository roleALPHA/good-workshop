import { describe, expect, it } from 'vitest'
import type { DayDoc } from '@/domain/agenda/types'
import { describeProjection } from './drag-announcement'
import { flattenDay } from './flatten'
import { getProjection, rowsForDrag, toProjectionRows, type Projection } from './projection'
import { MODULE_TYPES_BY_ID } from './fixtures/module-types'

/**
 * What a screen reader is told while a block is being dragged.
 *
 * The only account of the drag for somebody who cannot see it -- and the
 * left/right indent gesture, the only way to nest a block from the keyboard, has
 * no other feedback at all. So the sentence has to describe the PROJECTED result
 * rather than the row under the cursor, and it has to name the section and the
 * new start time rather than "item 3 of 12".
 *
 * Asserted against keys and values rather than German sentences: what is under
 * test is which message is chosen and what it is handed, and both survive the
 * wording being rephrased in four languages.
 */

const INDENT = 28

/** Records what the translator was asked for, and answers with the key. */
function translator() {
  const calls: { key: string; values?: Record<string, unknown> }[] = []
  const t = ((key: string, values?: Record<string, unknown>) => {
    calls.push({ key, values })
    return key
  }) as never
  return {
    t,
    calls,
    /** The outermost message -- the sentence itself, asked for last. */
    sentence: () => calls[calls.length - 1]!,
  }
}

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
      durationMinutes: 30,
      pinnedStartMinute: null,
      desc: {},
      parked: false,
      responsible: [],
      order,
    })),
    moduleTypes: MODULE_TYPES_BY_ID,
  }
}

/** Projects the drag the way the editor does, then describes the result. */
function announce(
  d: DayDoc,
  activeId: string,
  overId: string,
  offsetX = 0,
  tense: 'landing' | 'dropped' = 'landing',
) {
  const rows = flattenDay(d)
  const projection = getProjection(
    rowsForDrag(toProjectionRows(rows), activeId),
    activeId,
    overId,
    offsetX,
    INDENT,
  )
  const recorder = translator()
  describeProjection(d, rows, activeId, projection, recorder.t, 'de', tense)
  return recorder
}

/** `Aufwärmen` holds `Kennenlernen`; the other two sit on the day, 30 minutes each. */
const day = doc(
  [['Aufwärmen', 1]],
  [
    ['Kennenlernen', 1, 'Aufwärmen'],
    ['Gruppenarbeit', 2, null],
    ['Kaffee', 3, null],
  ],
)

describe('the announcement during a drag', () => {
  it('names only the block while nothing has been projected yet', () => {
    const recorder = translator()
    const rows = flattenDay(day)
    describeProjection(day, rows, 'Kaffee', null, recorder.t, 'de')
    expect(recorder.sentence()).toEqual({ key: 'drag.picked', values: { title: 'Kaffee' } })
  })

  it('says the same for a projection the drag would refuse', () => {
    const recorder = translator()
    const rows = flattenDay(day)
    const refused: Projection = {
      depth: 0,
      parentId: null,
      index: 0,
      afterId: null,
      valid: false,
    }
    describeProjection(day, rows, 'Kaffee', refused, recorder.t, 'de')
    expect(recorder.sentence().key).toBe('drag.picked')
  })

  it('names the section a block would land in, by its title', () => {
    // The whole point of these sentences: a coordinate tells the listener
    // nothing about whether the agenda still makes sense.
    const { calls, sentence } = announce(day, 'Kaffee', 'Kennenlernen')
    expect(calls).toContainEqual({ key: 'drag.inSection', values: { title: 'Aufwärmen' } })
    expect(sentence().values).toMatchObject({ title: 'Kaffee', where: 'drag.inSection' })
  })

  it('says "at day level" when there is no section to name', () => {
    const { calls } = announce(day, 'Kennenlernen', 'Kaffee')
    expect(calls).toContainEqual({ key: 'drag.atDayLevel', values: undefined })
  })

  it('carries the start time the block WOULD have, not the one it has', () => {
    // Kaffee sits at 10:00 behind two blocks of thirty minutes. Dropped onto
    // Gruppenarbeit it takes the second day-level slot, so 09:30 -- and reading
    // the CURRENT schedule would announce 10:00, which is where it still is.
    const { sentence } = announce(day, 'Kaffee', 'Gruppenarbeit')
    expect(sentence()).toMatchObject({ key: 'drag.landedWithTime', values: { time: '09:30' } })
  })

  it('counts the position the move would produce, over the whole day', () => {
    // Third of `Aufwärmen, Kennenlernen, Kaffee, Gruppenarbeit` -- the rows
    // somebody counts on screen, section headers included.
    const { sentence } = announce(day, 'Kaffee', 'Gruppenarbeit')
    expect(sentence().values).toMatchObject({ position: 3 })
  })

  it('follows the indent gesture, which has no other feedback at all', () => {
    // The same row underneath, one INDENT_PX to the right. Without the
    // projection being described, ArrowRight would be silent -- and it is the
    // only way to nest a block from the keyboard.
    const flat = announce(day, 'Kaffee', 'Gruppenarbeit', 0)
    const nested = announce(day, 'Kaffee', 'Gruppenarbeit', INDENT)
    expect(flat.calls).toContainEqual({ key: 'drag.atDayLevel', values: undefined })
    expect(nested.calls).toContainEqual({
      key: 'drag.inSection',
      values: { title: 'Aufwärmen' },
    })
  })

  it('has its own message once the block has been dropped', () => {
    // Its own message rather than a word swapped out of the previous one:
    // `.replace('landet', 'abgelegt')` worked only in German, and only until
    // somebody rephrased the sentence it was reaching into.
    const { sentence } = announce(day, 'Kaffee', 'Kennenlernen', 0, 'dropped')
    expect(sentence().key).toBe('drag.droppedWithTime')
  })

  it('falls back to the id when it is asked about a row that is gone', () => {
    const recorder = translator()
    describeProjection(day, flattenDay(day), 'weg', null, recorder.t, 'de')
    expect(recorder.sentence().values).toEqual({ title: 'weg' })
  })
})
