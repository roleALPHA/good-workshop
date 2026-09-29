import { describe, expect, it } from 'vitest'
import { generateVoucherCode, normaliseVoucherCode, VOUCHER_CODE } from './voucher-code'

describe('a voucher code', () => {
  it.each([
    ['fruehling26', 'FRUEHLING26'],
    ['  Spring-26 ', 'SPRING-26'],
    ['ABCD', 'ABCD'],
  ])('%j is read as %s', (typed, code) => {
    expect(normaliseVoucherCode(typed)).toBe(code)
  })

  it.each([['abc'], ['A'.repeat(33)], ['FRÜHLING'], ['SPRING 26'], [''], [null], [42]])(
    '%j is not one',
    (typed) => {
      expect(normaliseVoucherCode(typed)).toBeNull()
    },
  )

  it('is generated readable: ten characters, none that look like another', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateVoucherCode()))
    // Two hundred draws from 31^10 do not collide unless something is broken.
    expect(codes.size).toBe(200)
    for (const code of codes) {
      expect(code).toMatch(VOUCHER_CODE)
      expect(code).toHaveLength(10)
      expect(code).not.toMatch(/[01ILO]/)
    }
  })
})
