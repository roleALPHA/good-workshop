import { describe, expect, it } from 'vitest'
import { EU_COUNTRIES } from '@/cloud/registration/rules'
import { STANDARD_VAT_RATES, taxTreatment } from './treatment'

describe('taxTreatment', () => {
  it.each([
    [
      'Austrian business',
      'business',
      'AT',
      'valid',
      ['AT'],
      { kind: 'domestic', country: 'AT', rate: 0.2 },
    ],
    [
      'Austrian business without VAT number',
      'business',
      'AT',
      'none',
      ['AT'],
      { kind: 'domestic', country: 'AT', rate: 0.2 },
    ],
    [
      'Austrian consumer',
      'consumer',
      'AT',
      'none',
      ['AT'],
      { kind: 'domestic', country: 'AT', rate: 0.2 },
    ],
    [
      'German business with a valid number',
      'business',
      'DE',
      'valid',
      ['DE'],
      { kind: 'reverse_charge', country: 'DE' },
    ],
    [
      'German business, check pending',
      'business',
      'DE',
      'pending',
      ['DE'],
      { kind: 'hold', reason: 'vat_pending' },
    ],
    [
      'German business with an invalid number',
      'business',
      'DE',
      'invalid',
      ['DE'],
      { kind: 'oss', country: 'DE', rate: 0.19 },
    ],
    [
      'French consumer',
      'consumer',
      'FR',
      'none',
      ['FR', 'FR'],
      { kind: 'oss', country: 'FR', rate: 0.2 },
    ],
    [
      'Finnish consumer',
      'consumer',
      'FI',
      'none',
      ['FI'],
      { kind: 'oss', country: 'FI', rate: 0.255 },
    ],
    [
      'consumer whose card is from elsewhere',
      'consumer',
      'IT',
      'none',
      ['IT', 'DE'],
      { kind: 'hold', reason: 'evidence_conflict' },
    ],
    ['Swiss business', 'business', 'CH', 'none', ['CH'], { kind: 'export', country: 'CH' }],
    ['British consumer', 'consumer', 'GB', 'none', ['GB'], { kind: 'export', country: 'GB' }],
  ] as const)('%s', (_, customerType, country, vatStatus, evidence, expected) => {
    expect(taxTreatment({ customerType, country, vatStatus, evidence: [...evidence] })).toEqual(
      expected,
    )
  })

  it('knows a rate for every member state', () => {
    expect(EU_COUNTRIES.filter((country) => STANDARD_VAT_RATES[country] === undefined)).toEqual([])
  })
})
