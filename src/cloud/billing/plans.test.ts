import { describe, expect, it } from 'vitest'
import { PLANS, PLAN_KEYS, TRIAL_DAYS, isPlanKey } from './plans'

describe('plans', () => {
  it('are five euro net per user month, one per workshop', () => {
    expect(PLANS.per_user).toEqual({ key: 'per_user', netCents: 500, unit: 'user_month' })
    expect(PLANS.per_workshop).toEqual({ key: 'per_workshop', netCents: 100, unit: 'workshop' })
    expect(PLAN_KEYS).toEqual(['per_user', 'per_workshop'])
  })

  it.each([
    ['per_user', true],
    ['per_workshop', true],
    ['free', false],
    [undefined, false],
    ['toString', false],
  ])('recognises %s as a plan: %s', (value, expected) => {
    expect(isPlanKey(value)).toBe(expected)
  })

  it('gives fourteen days of trial', () => {
    expect(TRIAL_DAYS).toBe(14)
  })
})
