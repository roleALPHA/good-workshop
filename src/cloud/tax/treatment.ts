import { EU_COUNTRIES } from '@/cloud/registration/rules'

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
  | { kind: 'export'; country: string }
  | { kind: 'hold'; reason: 'vat_pending' | 'vat_invalid' }

/** Austrian VAT on a domestic invoice. Checked against the accounting system's result. */
export const AUSTRIAN_VAT_RATE = 0.2

const isEu = (country: string) => (EU_COUNTRIES as readonly string[]).includes(country)

/**
 * GoodWorkshop Cloud invoices businesses only, so there are three honest answers
 * and one refusal to guess.
 */
export function taxTreatment(input: { country: string; vatStatus: VatStatus }): TaxTreatment {
  const { country, vatStatus } = input

  if (country === 'AT') return { kind: 'domestic', country: 'AT', rate: AUSTRIAN_VAT_RATE }

  // Outside the EU the supply is not taxable in Austria.
  if (!isEu(country)) return { kind: 'export', country }

  if (vatStatus === 'valid') return { kind: 'reverse_charge', country }
  // Asked but not answered yet: wait rather than bill with VAT the customer
  // would have to reclaim.
  if (vatStatus === 'pending') return { kind: 'hold', reason: 'vat_pending' }
  // A business in another member state without a valid number cannot be
  // invoiced net, and is not a customer this offer is for: an operator decides.
  return { kind: 'hold', reason: 'vat_invalid' }
}
