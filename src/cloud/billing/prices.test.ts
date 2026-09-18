import { describe, expect, it } from 'vitest'
import { isStale, nextChangeMonth, priceAt, type PlanPrice } from './prices'

/**
 * Which price a month is billed at, and when a change may take effect.
 *
 * The accounting system owns the number; these rules own the timing. Both
 * matter to a customer: one is what they pay, the other is whether they were
 * told before they paid it.
 */

const prices: PlanPrice[] = [
  { plan: 'per_user', netCents: 100, effectiveFrom: '2026-01-01' },
  { plan: 'per_user', netCents: 500, effectiveFrom: '2026-10-01' },
  { plan: 'per_workshop', netCents: 100, effectiveFrom: '2026-01-01' },
]

describe('the price of a month', () => {
  it('is the one in force when the month began', () => {
    expect(priceAt(prices, 'per_user', '2026-09-01')).toBe(100)
    expect(priceAt(prices, 'per_user', '2026-10-01')).toBe(500)
    expect(priceAt(prices, 'per_user', '2026-11-01')).toBe(500)
  })

  it('does not change a month that is already running', () => {
    // The customer was told before October and pays the old price for
    // September -- even though the run that invoices September happens in
    // October, when the new price is already in force.
    expect(priceAt(prices, 'per_user', '2026-09-01')).toBe(100)
  })

  it('is absent before the first price, rather than guessed', () => {
    expect(priceAt(prices, 'per_user', '2025-12-01')).toBeNull()
    expect(priceAt(prices, 'per_workshop', '2025-12-01')).toBeNull()
  })

  it('is absent for a plan nothing was ever recorded for', () => {
    expect(priceAt([], 'per_user', '2026-09-01')).toBeNull()
  })
})

describe('when a change takes effect', () => {
  it('is the first of the coming month, never today', () => {
    // A price raised mid-month applies from the next month. That is the
    // announcement period existing customers were promised, in code.
    expect(nextChangeMonth(new Date('2026-09-18T10:00:00Z'))).toBe('2026-10-01')
    expect(nextChangeMonth(new Date('2026-09-01T00:00:00Z'))).toBe('2026-10-01')
    expect(nextChangeMonth(new Date('2026-12-31T23:59:00Z'))).toBe('2027-01-01')
  })
})

describe('a price nobody has confirmed', () => {
  const now = new Date('2026-09-18T12:00:00Z')

  it('is fresh while the accounting system answered recently', () => {
    expect(isStale(new Date('2026-09-18T11:00:00Z'), now)).toBe(false)
  })

  it('goes stale after a day, and blocks new orders', () => {
    expect(isStale(new Date('2026-09-17T11:00:00Z'), now)).toBe(true)
  })

  it('counts never asked as stale', () => {
    expect(isStale(null, now)).toBe(true)
  })
})
