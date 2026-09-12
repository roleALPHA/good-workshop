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
