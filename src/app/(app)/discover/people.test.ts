import { describe, expect, it } from 'vitest'
import { peopleLabel } from './people'

/**
 * Which of the four sentences a group size is.
 *
 * Asserted on the key and the numbers, never on a German sentence: the
 * catalogue speaks four languages, and a test against one of them would be a
 * statement about that translation rather than about the rule --
 * docs/testing-conventions.md, "assertions name keys, not sentences".
 */
describe('peopleLabel', () => {
  it.each([
    [
      { minParticipants: 12, maxParticipants: 20 },
      { key: 'peopleRange', min: 12, max: 20 },
    ],
    [
      { minParticipants: 12, maxParticipants: null },
      { key: 'peopleFrom', min: 12 },
    ],
    [
      { minParticipants: null, maxParticipants: 20 },
      { key: 'peopleTo', max: 20 },
    ],
    [{ minParticipants: null, maxParticipants: null }, { key: 'peopleAny' }],
  ])('reads %o as %o', (range, expected) => {
    expect(peopleLabel(range)).toEqual(expected)
  })

  it('keeps a lower bound of one rather than treating it as absent', () => {
    // A truthiness check would turn "from 1 person" into "any number of
    // people", which is a different claim about the design.
    expect(peopleLabel({ minParticipants: 1, maxParticipants: null })).toEqual({
      key: 'peopleFrom',
      min: 1,
    })
  })

  it('keeps an upper bound of zero, absurd as it is, rather than losing it', () => {
    // Nothing forbids it in the data, and a filter that silently widened a
    // design to "any size" would be worse than showing the absurd number.
    expect(peopleLabel({ minParticipants: null, maxParticipants: 0 })).toEqual({
      key: 'peopleTo',
      max: 0,
    })
  })
})
