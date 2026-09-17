import { DomainError } from '@/domain/errors'
import { PERSON_NAME_MAX_LENGTH, normalisePersonName } from '@/domain/tenant/person-name'
import { isPlanKey, type PlanKey } from '@/cloud/billing/plans'

/**
 * What a registration has to contain before anything is written.
 *
 * Pure, and the whole of the rule: the form, the server action and the database
 * function all rely on this having run. What it does not do is check a VAT
 * number against VIES -- that is a network call and lives with billing.
 */

export class SignupError extends DomainError {}

export type CustomerType = 'business' | 'consumer'

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
  /** The workspace's name: the company for a business, the person's name otherwise. */
  workspaceName: string
  companyName: string | null
  street: string
  postalCode: string
  city: string
  country: SignupCountry
  /** Normalised: upper case, no spaces or punctuation, country prefix included. */
  vatId: string | null
  plan: PlanKey
  acceptedTerms: true
  /** Businesses only: the data processing agreement. */
  acceptedDpa: boolean
  /** Consumers only: service starts within the withdrawal period (§ 10 FAGG). */
  requestedEarlyStart: boolean
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

/** Whether a business in this country needs a VAT number to be billed net. */
export function vatIdRequired(customerType: CustomerType, country: SignupCountry): boolean {
  return (
    customerType === 'business' &&
    country !== 'AT' &&
    (EU_COUNTRIES as readonly string[]).includes(country)
  )
}

/** The prefix a VAT number from this country starts with. Greece is EL, not GR. */
export function vatPrefix(country: SignupCountry): string {
  return country === 'GR' ? 'EL' : country
}

export function parseSignup(raw: Record<string, unknown>): Signup {
  const customerType =
    raw.customerType === 'consumer'
      ? 'consumer'
      : raw.customerType === 'business'
        ? 'business'
        : null
  if (!customerType) throw new SignupError('signup.customerType')

  const { firstName, lastName } = normalisePersonName({
    firstName: raw.firstName,
    lastName: raw.lastName,
  })

  const email = text(raw.email, 320).toLowerCase()
  if (!EMAIL.test(email) || email.length > 320) throw new SignupError('signup.invalidEmail')

  const country = text(raw.country, 2).toUpperCase()
  if (!(SIGNUP_COUNTRIES as readonly string[]).includes(country)) {
    throw new SignupError('signup.country')
  }

  const companyName = text(raw.companyName, 200)
  if (customerType === 'business' && companyName === '') throw new SignupError('signup.companyName')
  if (companyName.length > 200) throw new SignupError('signup.tooLong')

  const street = text(raw.street, 200)
  const postalCode = text(raw.postalCode, 20)
  const city = text(raw.city, 100)
  if (!street || !postalCode || !city) throw new SignupError('signup.address')
  if (street.length > 200 || postalCode.length > 20 || city.length > 100) {
    throw new SignupError('signup.tooLong')
  }

  const vatId = customerType === 'business' ? normaliseVatId(raw.vatId) : null
  const typedCountry = country as SignupCountry
  if (vatIdRequired(customerType, typedCountry) && !vatId)
    throw new SignupError('signup.vatIdRequired')
  if (vatId && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vatId)) throw new SignupError('signup.vatIdFormat')
  if (vatId && !vatId.startsWith(vatPrefix(typedCountry)))
    throw new SignupError('signup.vatIdCountry')

  if (!isPlanKey(raw.plan)) throw new SignupError('signup.plan')
  if (raw.acceptedTerms !== true) throw new SignupError('signup.terms')

  const acceptedDpa = customerType === 'business' && raw.acceptedDpa === true
  if (customerType === 'business' && !acceptedDpa) throw new SignupError('signup.dpa')

  const requestedEarlyStart = customerType === 'consumer' && raw.requestedEarlyStart === true
  if (customerType === 'consumer' && !requestedEarlyStart)
    throw new SignupError('signup.earlyStart')

  const personal = `${firstName} ${lastName}`.slice(0, PERSON_NAME_MAX_LENGTH * 2 + 1)
  return {
    customerType,
    firstName,
    lastName,
    email,
    workspaceName: customerType === 'business' ? companyName : personal,
    companyName: customerType === 'business' ? companyName : null,
    street,
    postalCode,
    city,
    country: typedCountry,
    vatId,
    plan: raw.plan,
    acceptedTerms: true,
    acceptedDpa,
    requestedEarlyStart,
  }
}
