import { describe, expect, it } from 'vitest'
import { normaliseVatId, parseSignup, vatIdRequired } from './rules'

const business = {
  confirmedBusiness: true,
  firstName: 'Anna',
  lastName: 'Berger',
  email: ' Anna@Example.COM ',
  companyName: 'Berger  Consulting GmbH',
  street: 'Hauptplatz 1',
  postalCode: '1010',
  city: 'Wien',
  country: 'at',
  vatId: 'atu 123-456 78',
  plan: 'per_user',
  acceptedTerms: true,
  acceptedDpa: true,
}

describe('parseSignup', () => {
  it('normalises a business', () => {
    expect(parseSignup(business)).toEqual({
      customerType: 'business',
      firstName: 'Anna',
      lastName: 'Berger',
      email: 'anna@example.com',
      workspaceName: 'Berger Consulting GmbH',
      companyName: 'Berger Consulting GmbH',
      street: 'Hauptplatz 1',
      postalCode: '1010',
      city: 'Wien',
      country: 'AT',
      vatId: 'ATU12345678',
      plan: 'per_user',
      confirmedBusiness: true,
      acceptedTerms: true,
      acceptedDpa: true,
    })
  })

  it('refuses anybody who has not confirmed ordering as a business, before anything else', () => {
    expect(() =>
      parseSignup({ ...business, confirmedBusiness: undefined, email: 'kaputt' }),
    ).toThrow('signup.business')
    expect(() => parseSignup({ ...business, confirmedBusiness: 'true' })).toThrow('signup.business')
  })

  it.each([
    ['no first name', { firstName: ' ' }, 'person.firstNameRequired'],
    ['a bad address', { email: 'kein-at' }, 'signup.invalidEmail'],
    ['an unknown country', { country: 'XX' }, 'signup.country'],
    ['no company', { companyName: '' }, 'signup.companyName'],
    ['no street', { street: '' }, 'signup.address'],
    [
      'an EU business abroad without VAT number',
      { country: 'DE', vatId: '' },
      'signup.vatIdRequired',
    ],
    ['a malformed VAT number', { vatId: 'AT' }, 'signup.vatIdFormat'],
    [
      'a VAT number from another country',
      { country: 'DE', vatId: 'ATU12345678' },
      'signup.vatIdCountry',
    ],
    ['an unknown plan', { plan: 'toString' }, 'signup.plan'],
    ['terms not accepted', { acceptedTerms: 'true' }, 'signup.terms'],
    ['no data processing agreement', { acceptedDpa: false }, 'signup.dpa'],
  ])('refuses %s', (_, overrides, key) => {
    expect(() => parseSignup({ ...business, ...overrides })).toThrow(key)
  })

  it('accepts an Austrian business without a VAT number, and a Swiss one', () => {
    expect(parseSignup({ ...business, vatId: '' }).vatId).toBeNull()
    expect(parseSignup({ ...business, country: 'CH', vatId: '' }).country).toBe('CH')
  })

  it('knows Greek VAT numbers start with EL', () => {
    expect(parseSignup({ ...business, country: 'GR', vatId: 'EL123456789' }).vatId).toBe(
      'EL123456789',
    )
  })
})

describe('vatIdRequired', () => {
  it.each([
    ['DE', true],
    ['FR', true],
    ['AT', false],
    ['CH', false],
  ] as const)('%s: %s', (country, expected) => {
    expect(vatIdRequired(country)).toBe(expected)
  })
})

describe('normaliseVatId', () => {
  it.each([
    [' de 123.456.789 ', 'DE123456789'],
    ['', null],
    [undefined, null],
  ])('%s → %s', (input, expected) => {
    expect(normaliseVatId(input)).toBe(expected)
  })
})
