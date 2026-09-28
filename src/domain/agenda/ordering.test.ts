import { describe, expect, it } from 'vitest'
import { keyAtEnd, keyBetween, ordinalsByParent, placeAfter, sortByPosition } from './ordering'

const item = (id: string, position: string) => ({ id, position })

describe('sortByPosition', () => {
  it('orders lexicographically, exactly as the database does', () => {
    const sorted = sortByPosition([item('c', 'a2'), item('a', 'a0'), item('b', 'a1')])
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('breaks ties on equal keys by id, so two clients agree', () => {
    // Jittered keys make collisions vanishingly rare rather than impossible;
    // the tie-break is what keeps the result deterministic when one happens.
    const sorted = sortByPosition([item('b', 'a0'), item('a', 'a0')])
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('ordinalsByParent', () => {
  const row = (id: string, position: string, parentId: string | null = null) => ({
    id,
    position,
    parentId,
  })

  it.each([
    [
      'numbers the day level from 0, clusters and blocks in one list',
      [row('cl', 'a1'), row('m1', 'a0'), row('m2', 'a2')],
      { m1: 0, cl: 1, m2: 2 },
    ],
    [
      'gives every sibling list its own 0',
      [row('cl', 'a0'), row('a', 'a0', 'cl'), row('b', 'a1', 'cl')],
      { cl: 0, a: 0, b: 1 },
    ],
    [
      'counts the strands of a breakout among themselves, not in the day',
      [row('bo', 'a0'), row('s1', 'a0', 'bo'), row('s2', 'a1', 'bo'), row('after', 'a1')],
      { bo: 0, after: 1, s1: 0, s2: 1 },
    ],
    [
      'counts the blocks of a strand among themselves -- three levels, three spaces',
      [
        row('bo', 'a0'),
        row('s1', 'a0', 'bo'),
        row('x', 'a0', 's1'),
        row('y', 'a1', 's1'),
        row('s2', 'a1', 'bo'),
        row('z', 'a0', 's2'),
      ],
      { bo: 0, s1: 0, s2: 1, x: 0, y: 1, z: 0 },
    ],
    [
      'breaks ties on equal keys by id, like the database',
      [row('b', 'a0'), row('a', 'a0')],
      { a: 0, b: 1 },
    ],
    ['says nothing about nothing', [], {}],
  ])('%s', (_name, rows, expected) => {
    expect(Object.fromEntries(ordinalsByParent(rows))).toEqual(expected)
  })

  it('does not care what order the rows arrive in', () => {
    const rows = [row('s2', 'a1', 'bo'), row('bo', 'a0'), row('s1', 'a0', 'bo')]
    expect(Object.fromEntries(ordinalsByParent(rows))).toEqual({ bo: 0, s1: 0, s2: 1 })
  })
})

describe('placeAfter', () => {
  const siblings = [item('a', 'a0'), item('b', 'a1'), item('c', 'a2')]

  it('places at the very start when there is no anchor', () => {
    const { position } = placeAfter(siblings, null)
    expect(position < 'a0').toBe(true)
  })

  it('places strictly between two neighbours', () => {
    const { position } = placeAfter(siblings, 'a')
    expect(position > 'a0').toBe(true)
    expect(position < 'a1').toBe(true)
  })

  it('places at the end after the last sibling', () => {
    const { position } = placeAfter(siblings, 'c')
    expect(position > 'a2').toBe(true)
  })

  it('appends when the anchor disappeared instead of failing the move', () => {
    const { position } = placeAfter(siblings, 'geloescht')
    expect(position > 'a2').toBe(true)
  })

  it('places into an empty list', () => {
    expect(placeAfter([], null).position).toBeTruthy()
  })

  it('asks for a rebalance once keys grow too long', () => {
    // Constructed rather than reached by iteration: base62 gives roughly 62
    // insertions per extra character, so "insert between the same neighbours
    // until it hurts" would need thousands of rounds to prove anything. What
    // matters is that the long-key path is handled, not how long it takes to
    // get there.
    const long = 'a0' + 'V'.repeat(47)
    const siblings = [item('a', long), item('b', long + 'V')]

    const { rebalance } = placeAfter(siblings, 'a')

    expect(rebalance).not.toBeNull()
    // A slot for the new row plus every existing sibling, all short again.
    expect(rebalance!.length).toBe(siblings.length + 1)
    expect(Math.max(...rebalance!.map((r) => r.position.length))).toBeLessThan(10)
    expect(rebalance!.map((r) => r.position)).toEqual([...rebalance!.map((r) => r.position)].sort())
    // The empty id marks where the moving row goes -- here, straight after 'a'.
    expect(rebalance!.map((r) => r.id)).toEqual(['a', '', 'b'])
  })

  it('leaves short keys alone', () => {
    expect(placeAfter([item('a', 'a0'), item('b', 'a1')], 'a').rebalance).toBeNull()
  })
})

describe('keyBetween / keyAtEnd', () => {
  it('produces a key after everything in the list', () => {
    expect(keyAtEnd([item('a', 'a0'), item('b', 'a1')]) > 'a1').toBe(true)
  })

  it('produces a first key for an empty list', () => {
    expect(keyAtEnd([])).toBeTruthy()
  })

  it('is stable: the same neighbours give the same key', () => {
    expect(keyBetween('a0', 'a1')).toBe(keyBetween('a0', 'a1'))
  })
})
