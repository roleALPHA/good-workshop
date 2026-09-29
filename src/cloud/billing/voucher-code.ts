import { randomInt } from 'node:crypto'

/**
 * What a voucher code looks like, on both sides of it: the console that makes
 * one and the billing page where somebody types it in. The database checks the
 * same pattern (drizzle-cloud/0030_vouchers.sql).
 */
export const VOUCHER_CODE = /^[A-Z0-9-]{4,32}$/

/** A typed code as it is stored -- trimmed, upper case -- or null if it cannot be one. */
export function normaliseVoucherCode(typed: unknown): string | null {
  if (typeof typed !== 'string') return null
  const code = typed.trim().toUpperCase()
  return VOUCHER_CODE.test(code) ? code : null
}

// Without 0/O, 1/I/L: a code gets read out on the phone and copied off paper.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A code for when the operator does not choose one: ten characters, about 50 bits. */
export function generateVoucherCode(): string {
  return Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}
