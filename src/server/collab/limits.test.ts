import { describe, expect, it } from 'vitest'
import { TokenBucket } from './limits'

/**
 * The bucket every live connection spends from.
 *
 * A table, because the interesting cases are all about time -- a bucket that
 * refills too eagerly is no limit, and one that never refills cuts off a person
 * who typed quickly for a minute.
 */
describe('TokenBucket', () => {
  it.each([
    // [what, capacity, perSecond, steps: [advanceMs, take, expected]]
    ['starts full', 10, 1, [[0, 10, true]]],
    ['refuses more than it holds', 10, 1, [[0, 11, false]]],
    [
      'refuses once drained',
      10,
      1,
      [
        [0, 10, true],
        [0, 1, false],
      ],
    ],
    [
      'refills with time',
      10,
      5,
      [
        [0, 10, true],
        [1_000, 5, true],
        [0, 1, false],
      ],
    ],
    [
      'refills only part way in part of a second',
      10,
      10,
      [
        [0, 10, true],
        [300, 3, true],
        [0, 1, false],
      ],
    ],
    [
      'never holds more than its capacity',
      10,
      100,
      [
        [0, 10, true],
        [60_000, 11, false],
        [0, 10, true],
      ],
    ],
    [
      'a refused take costs nothing',
      10,
      1,
      [
        [0, 8, true],
        [0, 5, false],
        [0, 2, true],
      ],
    ],
    [
      'a take of nothing always succeeds',
      1,
      1,
      [
        [0, 1, true],
        [0, 0, true],
      ],
    ],
  ] as const)('%s', (_what, capacity, perSecond, steps) => {
    let now = 0
    const bucket = new TokenBucket(capacity, perSecond, () => now)

    for (const [advance, amount, expected] of steps) {
      now += advance
      expect(bucket.take(amount)).toBe(expected)
    }
  })
})
