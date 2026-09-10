import { describe, expect, it } from 'vitest'
import { keyAtEnd, keyBetween, placeAfter, sortByPosition } from './ordering'

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
