import { describe, expect, it } from 'vitest'
import {
  initials,
  MAX_RESPONSIBLE,
  normalizeResponsible,
  resolveResponsible,
  responsibleFromInput,
} from './responsible'

const MIRA = '0190a000-0000-7000-8000-000000000001'
const JONAS = '0190a000-0000-7000-8000-000000000002'
const people = [
  { id: MIRA, name: 'Mira Schulz' },
  { id: JONAS, name: 'Jonas' },
]

describe('normalizeResponsible', () => {
  it.each([
    ['not an array', 'Mira', []],
    ['null', null, []],
    ['an empty list', [], []],
    ['a member', [{ name: 'Mira', memberId: MIRA }], [{ name: 'Mira', memberId: MIRA }]],
    ['somebody external', [{ name: 'Frau Berg' }], [{ name: 'Frau Berg', memberId: null }]],
    ['surrounding whitespace', [{ name: '  Frau Berg ' }], [{ name: 'Frau Berg', memberId: null }]],
    ['a blank name', [{ name: '   ' }], []],
    ['a name that is no string', [{ name: 42 }], []],
    [
      'a member id that is no uuid',
      [{ name: 'X', memberId: 'm-1' }],
      [{ name: 'X', memberId: null }],
    ],
    [
      'the same member twice',
      [
        { name: 'Mira', memberId: MIRA },
        { name: 'Mira S.', memberId: MIRA },
      ],
      [{ name: 'Mira', memberId: MIRA }],
    ],
    [
      'the same external name twice, differently cased',
      [{ name: 'Frau Berg' }, { name: 'frau berg' }],
      [{ name: 'Frau Berg', memberId: null }],
    ],
    [
      'a member and an external of the same name',
      [{ name: 'Jonas', memberId: JONAS }, { name: 'Jonas' }],
      [
        { name: 'Jonas', memberId: JONAS },
        { name: 'Jonas', memberId: null },
      ],
    ],
    ['garbage entries', ['Mira', null, 3], []],
  ])('%s', (_case, raw, expected) => {
    expect(normalizeResponsible(raw)).toEqual(expected)
  })

  it('cuts an overlong name rather than refusing the person', () => {
    const [entry] = normalizeResponsible([{ name: 'x'.repeat(500) }])
    expect(entry!.name).toHaveLength(120)
  })

  it('keeps at most so many people', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Person ${i}` }))
    expect(normalizeResponsible(many)).toHaveLength(MAX_RESPONSIBLE)
  })
})

describe('resolveResponsible', () => {
  it.each([
    [
      'a member under their current name',
      [{ name: 'Mira', memberId: MIRA }],
      [{ name: 'Mira Schulz', memberId: MIRA, external: false }],
    ],
    [
      'a member the directory does not know, under the stored name',
      [{ name: 'Alt', memberId: '0190a000-0000-7000-8000-00000000dead' }],
      [{ name: 'Alt', memberId: '0190a000-0000-7000-8000-00000000dead', external: false }],
    ],
    [
      'somebody external',
      [{ name: 'Frau Berg', memberId: null }],
      [{ name: 'Frau Berg', memberId: null, external: true }],
    ],
  ])('%s', (_case, list, expected) => {
    expect(resolveResponsible(list, people)).toEqual(expected)
  })

  it('shows the stored names when there is no directory at all', () => {
    expect(resolveResponsible([{ name: 'Mira', memberId: MIRA }])).toEqual([
      { name: 'Mira', memberId: MIRA, external: false },
    ])
  })
})

describe('responsibleFromInput', () => {
  it.each([
    ['a member by exact name', 'Mira Schulz', { name: 'Mira Schulz', memberId: MIRA }],
    ['a member regardless of case and spaces', '  jonas ', { name: 'Jonas', memberId: JONAS }],
    ['somebody nobody knows', 'Frau Berg', { name: 'Frau Berg', memberId: null }],
    ['a partial match, which is not a match', 'Mira', { name: 'Mira', memberId: null }],
    ['a blank', '   ', null],
  ])('%s', (_case, text, expected) => {
    expect(responsibleFromInput(text, people)).toEqual(expected)
  })
})

describe('initials', () => {
  it.each([
    ['Mira Schulz', 'MS'],
    ['Jonas', 'J'],
    ['anna-lena von der Heide', 'AH'],
    ['  ', '?'],
    ['Élodie Brun', 'ÉB'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})
