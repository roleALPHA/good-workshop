import { describe, expect, it } from 'vitest'
import { normaliseVatId, parseSignup, vatIdRequired } from './rules'

const business = {
  customerType: 'business',
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

const consumer = {
  customerType: 'consumer',
  firstName: 'Ben',
  lastName: 'Huber',
  email: 'ben@example.com',
  street: 'Gasse 2',
  postalCode: '8010',
  city: 'Graz',
  country: 'AT',
  plan: 'per_workshop',
  acceptedTerms: true,
  requestedEarlyStart: true,
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
      acceptedTerms: true,
      acceptedDpa: true,
      requestedEarlyStart: false,
    })
  })

  it('names a consumer’s workspace after them and ignores business fields', () => {
    expect(
      parseSignup({ ...consumer, companyName: 'Egal', vatId: 'ATU1', acceptedDpa: true }),
    ).toMatchObject({
      workspaceName: 'Ben Huber',
      companyName: null,
      vatId: null,
      acceptedDpa: false,
      requestedEarlyStart: true,
    })
  })

  it.each([
    ['no customer type', { ...business, customerType: 'other' }, 'signup.customerType'],
    ['no first name', { ...business, firstName: ' ' }, 'person.firstNameRequired'],
    ['a bad address', { ...business, email: 'kein-at' }, 'signup.invalidEmail'],
    ['an unknown country', { ...business, country: 'XX' }, 'signup.country'],
    ['a business without a company', { ...business, companyName: '' }, 'signup.companyName'],
    ['no street', { ...business, street: '' }, 'signup.address'],
    [
      'an EU business abroad without VAT number',
      { ...business, country: 'DE', vatId: '' },
      'signup.vatIdRequired',
    ],
    ['a malformed VAT number', { ...business, vatId: 'AT' }, 'signup.vatIdFormat'],
    [
      'a VAT number from another country',
      { ...business, country: 'DE', vatId: 'ATU12345678' },
      'signup.vatIdCountry',
    ],
    ['an unknown plan', { ...business, plan: 'toString' }, 'signup.plan'],
    ['terms not accepted', { ...business, acceptedTerms: 'true' }, 'signup.terms'],
    ['a business without the DPA', { ...business, acceptedDpa: false }, 'signup.dpa'],
    [
      'a consumer without the early start request',
      { ...consumer, requestedEarlyStart: false },
      'signup.earlyStart',
    ],
  ])('refuses %s', (_, input, key) => {
    expect(() => parseSignup(input)).toThrow(key)
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
    ['business', 'DE', true],
    ['business', 'AT', false],
    ['business', 'CH', false],
    ['consumer', 'DE', false],
  ] as const)('%s in %s: %s', (type, country, expected) => {
    expect(vatIdRequired(type, country)).toBe(expected)
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
