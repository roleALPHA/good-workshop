import { describe, expect, it } from 'vitest'
import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { treeKeyboardCoordinateGetter } from './keyboard'

const INDENT = 28

/**
 * Rows of deliberately unequal height. That is the whole point: a uniform list
 * hides every bug this getter exists to prevent, because there the next row's
 * top and its bottom-aligned equivalent are the same number.
 */
const ROWS = [
  { id: 'cl-1', top: 100, height: 40 },
  { id: 'm-1', top: 140, height: 80 },
  { id: 'm-2', top: 220, height: 200 },
  { id: 'm-3', top: 420, height: 60 },
]

type Args = Parameters<KeyboardCoordinateGetter>[1]

/** Just enough of dnd-kit's sensor context for the getter to read. */
function args({ over, left = 0 }: { over: string; left?: number }): Args {
  const rect = (row: (typeof ROWS)[number]) => ({
    top: row.top,
    bottom: row.top + row.height,
    height: row.height,
    left,
    right: left + 900,
    width: 900,
  })
  const current = ROWS.find((r) => r.id === over)!

  return {
    active: 'm-1',
    currentCoordinates: { x: left, y: current.top },
    context: {
      collisionRect: rect(current),
      droppableRects: new Map(ROWS.map((r) => [r.id, rect(r)])),
      droppableContainers: { getEnabled: () => ROWS.map((r) => ({ id: r.id })) },
      over: { id: over },
    },
  } as unknown as Args
}

const key = (code: string) =>
  ({ code, preventDefault: () => undefined }) as unknown as KeyboardEvent

describe('treeKeyboardCoordinateGetter', () => {
  const getter = treeKeyboardCoordinateGetter(INDENT)

  it.each([
    ['ArrowDown', 'cl-1', { x: 0, y: 140 }],
    ['ArrowDown', 'm-1', { x: 0, y: 220 }],
    // The row below m-2 starts 200px further down, not one row height further.
    ['ArrowDown', 'm-2', { x: 0, y: 420 }],
    ['ArrowUp', 'm-3', { x: 0, y: 220 }],
    ['ArrowUp', 'm-2', { x: 0, y: 140 }],
    ['ArrowUp', 'm-1', { x: 0, y: 100 }],
  ])("%s from %s aims at the neighbouring row's top edge", (code, over, expected) => {
    expect(getter(key(code), args({ over }))).toEqual(expected)
  })

  it.each([
    ['ArrowUp', 'cl-1'],
    ['ArrowDown', 'm-3'],
  ])('%s past the %s end of the list returns nothing', (code, over) => {
    expect(getter(key(code), args({ over }))).toBeUndefined()
  })

  it('steps depth by exactly one indent and never touches y', () => {
    expect(getter(key('ArrowRight'), args({ over: 'm-2' }))).toEqual({ x: INDENT, y: 220 })
    expect(getter(key('ArrowLeft'), args({ over: 'm-2', left: INDENT }))).toEqual({
      x: 0,
      y: 220,
    })
  })

  it('carries the current indent through a vertical move', () => {
    // Otherwise landing on a row at a different depth would silently re-indent
    // the dragged row -- the horizontal axis is the only thing that may.
    expect(getter(key('ArrowDown'), args({ over: 'm-1', left: INDENT }))).toEqual({
      x: INDENT,
      y: 220,
    })
  })

  it('leaves keys it does not own to dnd-kit', () => {
    expect(getter(key('Space'), args({ over: 'm-1' }))).toBeUndefined()
    expect(getter(key('Tab'), args({ over: 'm-1' }))).toBeUndefined()
  })
})

/**
 * Columns. The whole X-axis decision hangs on these: inside a breakout left and
 * right mean "the strand beside this one", everywhere else they still mean
 * indent -- and ArrowDown must walk down a column rather than sideways along a
 * shared top edge.
 */
describe('treeKeyboardCoordinateGetter / breakout columns', () => {
  const getter = treeKeyboardCoordinateGetter(INDENT)

  /** Three strands side by side, two blocks each, plus a full-width row below. */
  const COLUMNS = [
    { id: 'a1', top: 100, height: 40, left: 0, width: 200 },
    { id: 'b1', top: 100, height: 60, left: 220, width: 200 },
    { id: 'c1', top: 100, height: 40, left: 440, width: 200 },
    { id: 'a2', top: 150, height: 40, left: 0, width: 200 },
    { id: 'b2', top: 170, height: 40, left: 220, width: 200 },
    { id: 'after', top: 300, height: 40, left: 0, width: 660 },
  ]

  function columnArgs(over: string): Args {
    const rect = (row: (typeof COLUMNS)[number]) => ({
      top: row.top,
      bottom: row.top + row.height,
      height: row.height,
      left: row.left,
      right: row.left + row.width,
      width: row.width,
    })
    const current = COLUMNS.find((r) => r.id === over)!
    return {
      active: over,
      currentCoordinates: { x: current.left, y: current.top },
      context: {
        collisionRect: rect(current),
        droppableRects: new Map(COLUMNS.map((r) => [r.id, rect(r)])),
        droppableContainers: { getEnabled: () => COLUMNS.map((r) => ({ id: r.id })) },
        over: { id: over },
      },
    } as unknown as Args
  }

  it('moves right into the next strand instead of indenting', () => {
    expect(getter(key('ArrowRight'), columnArgs('a1'))).toEqual({ x: 220, y: 100 })
  })

  it('moves left into the previous strand', () => {
    expect(getter(key('ArrowLeft'), columnArgs('c1'))).toEqual({ x: 220, y: 100 })
  })

  it('skips over a strand to reach the one beyond it, not two at once', () => {
    expect(getter(key('ArrowRight'), columnArgs('a1'))).not.toEqual({ x: 440, y: 100 })
  })

  it('falls back to indenting at the edge of the row', () => {
    // Nothing to the right of the last column, so the gesture goes back to
    // meaning what it means everywhere else.
    expect(getter(key('ArrowRight'), columnArgs('c1'))).toEqual({ x: 440 + INDENT, y: 100 })
  })

  it('walks DOWN its own column rather than sideways along a shared top edge', () => {
    // a1, b1 and c1 all start at y=100. Ranking by top edge alone made every
    // ArrowDown land in the first column.
    expect(getter(key('ArrowDown'), columnArgs('a1'))).toEqual({ x: 0, y: 150 })
    expect(getter(key('ArrowDown'), columnArgs('b1'))).toEqual({ x: 220, y: 170 })
  })

  it('leaves the breakout downwards when its column runs out', () => {
    expect(getter(key('ArrowDown'), columnArgs('a2'))).toEqual({ x: 0, y: 300 })
  })

  it('keeps left and right meaning indent on a full-width row', () => {
    expect(getter(key('ArrowRight'), columnArgs('after'))).toEqual({ x: 0 + INDENT, y: 300 })
    expect(getter(key('ArrowLeft'), columnArgs('after'))).toEqual({ x: 0 - INDENT, y: 300 })
  })
})
