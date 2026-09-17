import { EU_COUNTRIES, type CustomerType } from '@/cloud/registration/rules'

/**
 * Which VAT a month's invoice carries, decided from what we know about the
 * customer -- a pure function with a test table, because every wrong answer
 * here is either tax we owe and did not charge or tax we charged and must not.
 *
 * The accounting system computes the binding amount. What this decides is which
 * of its tax treatments applies, and whether an invoice may go out at all:
 * `hold` stops the billing run for this tenant and puts it in front of an
 * operator instead of guessing.
 */

export type VatStatus = 'none' | 'valid' | 'invalid' | 'pending'

export type TaxTreatment =
  | { kind: 'domestic'; country: 'AT'; rate: number }
  | { kind: 'reverse_charge'; country: string }
  | { kind: 'oss'; country: string; rate: number }
  | { kind: 'export'; country: string }
  | { kind: 'hold'; reason: 'vat_pending' | 'evidence_conflict' | 'unknown_rate' }

/**
 * EU standard VAT rates for electronically supplied services, as of 2026.
 * Used to check the accounting system's result, not to compute an invoice --
 * a rate that changed makes the run stop rather than bill the wrong amount.
 * Review when a member state changes its rate.
 */
export const STANDARD_VAT_RATES: Record<string, number> = {
  AT: 0.2,
  BE: 0.21,
  BG: 0.2,
  CY: 0.19,
  CZ: 0.21,
  DE: 0.19,
  DK: 0.25,
  EE: 0.24,
  ES: 0.21,
  FI: 0.255,
  FR: 0.2,
  GR: 0.24,
  HR: 0.25,
  HU: 0.27,
  IE: 0.23,
  IT: 0.22,
  LT: 0.21,
  LU: 0.17,
  LV: 0.21,
  MT: 0.18,
  NL: 0.21,
  PL: 0.23,
  PT: 0.23,
  RO: 0.21,
  SE: 0.25,
  SI: 0.22,
  SK: 0.23,
}

const isEu = (country: string) => (EU_COUNTRIES as readonly string[]).includes(country)

export function taxTreatment(input: {
  customerType: CustomerType
  /** The billing address's country. */
  country: string
  vatStatus: VatStatus
  /** Every country recorded as evidence of where a consumer is (billing address, payment method). */
  evidence: string[]
}): TaxTreatment {
  const { customerType, country, vatStatus, evidence } = input

  if (country === 'AT') return { kind: 'domestic', country: 'AT', rate: STANDARD_VAT_RATES.AT! }

  if (!isEu(country)) {
    // Outside the EU the supply is not taxable in Austria, for businesses and
    // consumers alike.
    return { kind: 'export', country }
  }

  if (customerType === 'business') {
    if (vatStatus === 'valid') return { kind: 'reverse_charge', country }
    // Asked but not answered yet: billing a business with VAT it will have to
    // reclaim, or without VAT it may owe, are both wrong. Wait.
    if (vatStatus === 'pending') return { kind: 'hold', reason: 'vat_pending' }
    // No valid number: a business that cannot show one is billed like a
    // consumer in its country.
  }

  // A consumer in another member state pays that state's VAT (OSS), and where
  // they are has to be shown by evidence that does not contradict itself.
  if (evidence.some((place) => place !== country))
    return { kind: 'hold', reason: 'evidence_conflict' }
  const rate = STANDARD_VAT_RATES[country]
  if (rate === undefined) return { kind: 'hold', reason: 'unknown_rate' }
  return { kind: 'oss', country, rate }
}
