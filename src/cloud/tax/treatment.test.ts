import { describe, expect, it } from 'vitest'
import { taxTreatment } from './treatment'

describe('taxTreatment', () => {
  it.each([
    ['Austrian business', 'AT', 'valid', { kind: 'domestic', country: 'AT', rate: 0.2 }],
    [
      'Austrian business without VAT number',
      'AT',
      'none',
      { kind: 'domestic', country: 'AT', rate: 0.2 },
    ],
    [
      'German business with a valid number',
      'DE',
      'valid',
      { kind: 'reverse_charge', country: 'DE' },
    ],
    ['German business, check pending', 'DE', 'pending', { kind: 'hold', reason: 'vat_pending' }],
    [
      'German business with an invalid number',
      'DE',
      'invalid',
      { kind: 'hold', reason: 'vat_invalid' },
    ],
    ['French business without a number', 'FR', 'none', { kind: 'hold', reason: 'vat_invalid' }],
    ['Swiss business', 'CH', 'none', { kind: 'export', country: 'CH' }],
    ['British business', 'GB', 'valid', { kind: 'export', country: 'GB' }],
  ] as const)('%s', (_, country, vatStatus, expected) => {
    expect(taxTreatment({ country, vatStatus })).toEqual(expected)
  })
})
