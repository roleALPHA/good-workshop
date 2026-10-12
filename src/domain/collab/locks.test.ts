import { describe, expect, it } from 'vitest'
import { fieldHolders, lockKey, type FieldClaim } from './locks'

/**
 * Who holds a field, decided the same way on every screen.
 *
 * There is no server deciding: every browser sees the same claims through the
 * room and must come to the same answer from them, or two people would each
 * believe the field is theirs. That makes the rule a pure function of the
 * claims, and the tie-break has to be total.
 */
const claim = (clientId: number, field: string, since: number, blockId = 'b-1'): FieldClaim => ({
  clientId,
  blockId,
  field,
  since,
})

describe('fieldHolders', () => {
  it('gives each field to whoever claimed it', () => {
    const holders = fieldHolders([claim(1, 'title', 100), claim(2, 'desc.description', 100)])

    expect(holders.get(lockKey('b-1', 'title'))?.clientId).toBe(1)
    expect(holders.get(lockKey('b-1', 'desc.description'))?.clientId).toBe(2)
  })

  it('gives a field claimed twice to whoever came first', () => {
    const holders = fieldHolders([claim(1, 'title', 200), claim(2, 'title', 100)])
    expect(holders.get(lockKey('b-1', 'title'))?.clientId).toBe(2)
  })

  it('breaks a tie the same way whatever order the claims arrive in', () => {
    const a = fieldHolders([claim(7, 'title', 100), claim(3, 'title', 100)])
    const b = fieldHolders([claim(3, 'title', 100), claim(7, 'title', 100)])

    expect(a.get(lockKey('b-1', 'title'))?.clientId).toBe(3)
    expect(b.get(lockKey('b-1', 'title'))?.clientId).toBe(3)
  })

  it('keeps the same field of two blocks apart', () => {
    const holders = fieldHolders([claim(1, 'title', 100, 'b-1'), claim(2, 'title', 100, 'b-2')])
    expect(holders.size).toBe(2)
  })
})
