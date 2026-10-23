import type { ClientRect } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'
import type { ProjectionRow } from './projection'
import { agendaSortingStrategy } from './sorting'

/**
 * Which rows make room while something is dragged.
 *
 * Reported as "drag a card above a breakout and the agenda falls apart". The
 * breakout, each strand and each strand's blocks are sortable items of ONE
 * flat list, but on screen they sit inside each other and the strands stand
 * side by side. A vertical list strategy shifted every one of them by the
 * dragged card's height -- the breakout, then the strand inside it again, then
 * the block inside that once more -- and the strands climbed out of their own
 * box.
 */

const row = (
  id: string,
  kind: 'module' | 'cluster',
  parentId: string | null = null,
  depth: 0 | 1 | 2 = 0,
  mode: 'sequential' | 'parallel' = 'sequential',
): ProjectionRow => ({ id, kind, mode, depth, parentId })

// Lunch, then a breakout with two strands, then a block below it -- the
// reference day in miniature.
const ROWS: ProjectionRow[] = [
  row('lunch', 'module'),
  row('bo', 'cluster', null, 0, 'parallel'),
  row('s1', 'cluster', 'bo', 1),
  row('x', 'module', 's1', 2),
  row('y', 'module', 's1', 2),
  row('s2', 'cluster', 'bo', 1),
  row('z', 'module', 's2', 2),
  row('it', 'module'),
]

const rect = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

// The breakout's box holds the strands; the strands stand side by side.
const RECTS: ClientRect[] = [
  rect(0, 0, 800, 50), // lunch
  rect(0, 50, 800, 200), // bo
  rect(0, 80, 400, 170), // s1
  rect(0, 110, 400, 50), // x
  rect(0, 170, 400, 50), // y
  rect(400, 80, 400, 170), // s2
  rect(400, 110, 400, 50), // z
  rect(0, 250, 800, 50), // it
]

const ids = ROWS.map((r) => r.id)

/** The transform each row gets for one drag, by id; null means it stays put. */
function shifts(activeId: string, overId: string) {
  const strategy = agendaSortingStrategy(ROWS)
  const activeIndex = ids.indexOf(activeId)
  const overIndex = ids.indexOf(overId)
  return Object.fromEntries(
    ids.map((id, index) => {
      const t = strategy({
        activeNodeRect: RECTS[activeIndex]!,
        activeIndex,
        overIndex,
        index,
        rects: RECTS,
      })
      return [id, t ? { x: t.x, y: t.y } : null]
    }),
  )
}

describe('agendaSortingStrategy', () => {
  it('moves a breakout as one box when a block passes above it', () => {
    const s = shifts('it', 'lunch')

    expect(s.lunch).toEqual({ x: 0, y: 50 })
    expect(s.bo).toEqual({ x: 0, y: 50 })
    // Inside the breakout nothing moves on its own -- it rides along.
    expect(s.s1).toBeNull()
    expect(s.x).toBeNull()
    expect(s.y).toBeNull()
    expect(s.s2).toBeNull()
    expect(s.z).toBeNull()
    // And the card is shown where it lands: on top.
    expect(s.it).toEqual({ x: 0, y: -250 })
  })

  it('moves nothing inside the breakout when the block is over its head', () => {
    const s = shifts('it', 'bo')

    expect(s.lunch).toBeNull()
    expect(s.bo).toEqual({ x: 0, y: 50 })
    for (const id of ['s1', 'x', 'y', 's2', 'z']) expect(s[id]).toBeNull()
  })

  it('leaves the layout alone while a day-level block hovers over a strand', () => {
    // The block would land IN the strand; shifting the day around it would
    // show a landing spot the drop does not take.
    const s = shifts('it', 'x')
    for (const id of ids.filter((id) => id !== 'it')) expect(s[id]).toBeNull()
  })

  it('sorts within one strand as a list of its own', () => {
    const s = shifts('x', 'y')

    // 50 for the block, 10 for the gap between the two.
    expect(s.y).toEqual({ x: 0, y: -60 })
    expect(s.x).toEqual({ x: 0, y: 60 })
    // The neighbouring strand is not part of this list.
    expect(s.z).toBeNull()
    expect(s.s2).toBeNull()
  })

  it('shifts strands sideways, because that is how they stand', () => {
    const s = shifts('s1', 's2')

    expect(s.s2).toEqual({ x: -400, y: 0 })
    expect(s.s1).toEqual({ x: 400, y: 0 })
    // Their blocks travel inside them.
    expect(s.x).toBeNull()
    expect(s.z).toBeNull()
  })

  it('treats a block of the other strand as that strand when a strand is dragged', () => {
    const s = shifts('s1', 'z')
    expect(s.s2).toEqual({ x: -400, y: 0 })
    expect(s.z).toBeNull()
  })

  it('opens a slot in the day when a strand block is dragged out below the breakout', () => {
    const s = shifts('x', 'it')

    // `it` sits above the landing spot -- dnd-kit drops behind an over row
    // that lies further down -- so only what follows it would move.
    expect(s.it).toBeNull()
    expect(s.bo).toBeNull()
    expect(s.lunch).toBeNull()
    expect(s.y).toBeNull()
  })

  it('opens a slot in the day when a strand block is dragged out above the breakout', () => {
    const s = shifts('x', 'lunch')

    expect(s.lunch).toEqual({ x: 0, y: 50 })
    expect(s.bo).toEqual({ x: 0, y: 50 })
    expect(s.it).toEqual({ x: 0, y: 50 })
    expect(s.y).toBeNull()
    expect(s.x).toBeNull()
  })

  it('is the plain vertical list where there is no breakout', () => {
    const flat = [row('a', 'module'), row('c', 'cluster'), row('b', 'module', 'c', 1)]
    const rects = [rect(0, 0, 800, 50), rect(0, 50, 800, 50), rect(0, 100, 800, 50)]
    const strategy = agendaSortingStrategy(flat)
    const at = (index: number) =>
      strategy({ activeNodeRect: rects[0]!, activeIndex: 0, overIndex: 2, index, rects })

    expect(at(1)).toMatchObject({ y: -50 })
    expect(at(2)).toMatchObject({ y: -50 })
    expect(at(0)).toMatchObject({ y: 100 })
  })
})
