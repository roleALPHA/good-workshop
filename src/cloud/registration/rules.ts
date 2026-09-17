import { DomainError } from '@/domain/errors'
import { normalisePersonName } from '@/domain/tenant/person-name'
import { isPlanKey, type PlanKey } from '@/cloud/billing/plans'

/**
 * What a registration has to contain before anything is written.
 *
 * Pure, and the whole of the rule: the form, the server action and the database
 * function all rely on this having run. What it does not do is check a VAT
 * number against VIES -- that is a network call and lives with billing.
 */

export class SignupError extends DomainError {}

/**
 * GoodWorkshop Cloud sells to businesses only. The type stays a union of one so
 * that the stored value says what it means rather than being implied.
 */
export type CustomerType = 'business'

/** The EU member states, by ISO 3166-1 alpha-2 -- VIES uses EL for Greece, we store GR. */
export const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const

/** Countries the form offers: the EU, and the neighbours people actually register from. */
export const SIGNUP_COUNTRIES = [...EU_COUNTRIES, 'CH', 'LI', 'NO', 'GB'] as const
export type SignupCountry = (typeof SIGNUP_COUNTRIES)[number]

export type Signup = {
  customerType: CustomerType
  firstName: string
  lastName: string
  email: string
  /** The workspace's name: the company's. */
  workspaceName: string
  companyName: string
  street: string
  postalCode: string
  city: string
  country: SignupCountry
  /** Normalised: upper case, no spaces or punctuation, country prefix included. */
  vatId: string | null
  plan: PlanKey
  /** Ordering as a business (§ 1 UGB), not as a consumer -- confirmed, not assumed. */
  confirmedBusiness: true
  acceptedTerms: true
  acceptedDpa: true
}

const text = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max + 1)
    : ''

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function normaliseVatId(value: unknown): string | null {
  const cleaned = typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
  return cleaned === '' ? null : cleaned
}

/**
 * Whether a VAT number is required: for every business in another EU member
 * state, because a supply to it is only invoiced net (reverse charge) against a
 * valid number -- and without one there is nothing correct to invoice.
 */
export function vatIdRequired(country: SignupCountry): boolean {
  return country !== 'AT' && (EU_COUNTRIES as readonly string[]).includes(country)
}

/** The prefix a VAT number from this country starts with. Greece is EL, not GR. */
export function vatPrefix(country: SignupCountry): string {
  return country === 'GR' ? 'EL' : country
}

export function parseSignup(raw: Record<string, unknown>): Signup {
  // First, before anything else is looked at: the offer is not open to consumers.
  if (raw.confirmedBusiness !== true) throw new SignupError('signup.business')

  const { firstName, lastName } = normalisePersonName({
    firstName: raw.firstName,
    lastName: raw.lastName,
  })

  const email = text(raw.email, 320).toLowerCase()
  if (!EMAIL.test(email) || email.length > 320) throw new SignupError('signup.invalidEmail')

  const details = parseBillingDetails(raw)

  if (!isPlanKey(raw.plan)) throw new SignupError('signup.plan')
  if (raw.acceptedTerms !== true) throw new SignupError('signup.terms')
  if (raw.acceptedDpa !== true) throw new SignupError('signup.dpa')

  return {
    customerType: 'business',
    firstName,
    lastName,
    email,
    workspaceName: details.companyName,
    ...details,
    plan: raw.plan,
    confirmedBusiness: true,
    acceptedTerms: true,
    acceptedDpa: true,
  }
}

export type BillingDetails = {
  companyName: string
  street: string
  postalCode: string
  city: string
  country: SignupCountry
  vatId: string | null
}

/** Who is invoiced, at registration and whenever an admin corrects it. */
export function parseBillingDetails(raw: Record<string, unknown>): BillingDetails {
  const country = text(raw.country, 2).toUpperCase()
  if (!(SIGNUP_COUNTRIES as readonly string[]).includes(country)) {
    throw new SignupError('signup.country')
  }

  const companyName = text(raw.companyName, 200)
  if (companyName === '') throw new SignupError('signup.companyName')
  if (companyName.length > 200) throw new SignupError('signup.tooLong')

  const street = text(raw.street, 200)
  const postalCode = text(raw.postalCode, 20)
  const city = text(raw.city, 100)
  if (!street || !postalCode || !city) throw new SignupError('signup.address')
  if (street.length > 200 || postalCode.length > 20 || city.length > 100) {
    throw new SignupError('signup.tooLong')
  }

  const vatId = normaliseVatId(raw.vatId)
  const typedCountry = country as SignupCountry
  if (vatIdRequired(typedCountry) && !vatId) throw new SignupError('signup.vatIdRequired')
  if (vatId && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vatId)) throw new SignupError('signup.vatIdFormat')
  if (vatId && !vatId.startsWith(vatPrefix(typedCountry))) {
    throw new SignupError('signup.vatIdCountry')
  }

  return { companyName, street, postalCode, city, country: typedCountry, vatId }
}

/** A billing address, checked like the one at registration. */
export function parseBillingEmail(value: unknown): string {
  const email = text(value, 320).toLowerCase()
  if (!EMAIL.test(email) || email.length > 320) throw new SignupError('signup.invalidEmail')
  return email
}
