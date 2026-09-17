import { describe, expect, it } from 'vitest'
import { PLANS, PLAN_KEYS, TRIAL_DAYS, grossCents, isPlanKey } from './plans'

describe('plans', () => {
  it('are one euro net per user month and per workshop', () => {
    expect(PLANS.per_user).toEqual({ key: 'per_user', netCents: 100, unit: 'user_month' })
    expect(PLANS.per_workshop).toEqual({ key: 'per_workshop', netCents: 100, unit: 'workshop' })
    expect(PLAN_KEYS).toEqual(['per_user', 'per_workshop'])
  })

  it.each([
    [100, 120],
    [0, 0],
    [999, 1199],
    [1, 1],
  ])('shows %i cents net as %i cents gross', (net, gross) => {
    expect(grossCents(net)).toBe(gross)
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
