import { describe, expect, it } from 'vitest'
import type { Facet } from './ports'
import { CLEARED, isFiltered, queryFromParams, toggleFacet } from './query'

/**
 * What an address means, as a table.
 *
 * Every wrong answer here produces a perfectly readable page showing the wrong
 * designs -- or none -- with nothing to notice it by. The case that matters
 * most is the stale one: the filter vocabulary is authored at runtime, so a
 * bookmark can ask for a value that no longer exists, and the difference
 * between "ignore it" and "match nothing" is the difference between a page and
 * an apparently empty library.
 */

const FACETS: Facet[] = [
  {
    kind: 'purpose',
    label: 'Zweck',
    single: true,
    values: [
      { key: 'alignment', label: 'Ausrichtung' },
      { key: 'ideation', label: 'Ideenfindung' },
    ],
  },
  {
    kind: 'inclusivity',
    label: 'Inklusivität',
    single: false,
    values: [
      { key: 'seated', label: 'Im Sitzen' },
      { key: 'no_reading', label: 'Ohne Lesen' },
    ],
  },
]

const query = (params: Record<string, string | string[] | undefined>) =>
  queryFromParams(params, 'de', FACETS)

describe('reading the address', () => {
  it('keeps a value the catalogue offers', () => {
    expect(query({ purpose: 'alignment' }).facets).toEqual({ purpose: ['alignment'] })
  })

  it('reads several values of one facet', () => {
    expect(query({ inclusivity: 'seated,no_reading' }).facets).toEqual({
      inclusivity: ['seated', 'no_reading'],
    })
  })

  it('drops a value the catalogue no longer has, and answers the rest', () => {
    // The decisive case. A bookmark from before a value was retired must not
    // narrow the list to nothing; it asks a question the catalogue can still
    // answer, minus the part it cannot.
    expect(query({ purpose: 'alignment', inclusivity: 'seated,retired_one' }).facets).toEqual({
      purpose: ['alignment'],
      inclusivity: ['seated'],
    })
  })

  it('drops a facet kind it has never heard of', () => {
    expect(query({ nonsense: 'whatever' }).facets).toBeUndefined()
  })

  it('leaves facets out entirely when none survive, rather than sending an empty set', () => {
    // `{ purpose: [] }` reaching the catalogue would read as "match a purpose
    // that is none of these", which is nothing at all.
    expect(query({ purpose: 'retired_one' }).facets).toBeUndefined()
  })

  it('ignores duplicates and blanks', () => {
    expect(query({ inclusivity: 'seated,,seated' }).facets).toEqual({ inclusivity: ['seated'] })
  })
})

describe('the numbers', () => {
  it.each([
    ['12', 12],
    ['1', 1],
    ['10000', 10_000],
  ])('reads %s as a group of %i', (raw, expected) => {
    expect(query({ group: raw }).groupSize).toBe(expected)
  })

  it.each(['abc', '', '0', '-4', '10001', '1.5', ' '])(
    'treats an unusable group size (%p) as no answer at all',
    (raw) => {
      // Not a clamp: somebody who mistyped meant to ask about everything, and
      // silently answering for 1 person or for 10 000 would be a different
      // question than the one they asked.
      expect(query({ group: raw }).groupSize).toBeUndefined()
    },
  )

  it('reads the time available', () => {
    expect(query({ time: '240' }).maxMinutes).toBe(240)
  })

  it('keeps a search term and drops an empty one', () => {
    expect(query({ q: '  Strategie ' }).search).toBe('Strategie')
    expect(query({ q: '   ' }).search).toBeUndefined()
  })

  it('takes the first value when a parameter is repeated', () => {
    expect(query({ group: ['12', '40'] }).groupSize).toBe(12)
  })
})

describe('isFiltered', () => {
  it('is false for a bare list', () => {
    expect(isFiltered(query({}))).toBe(false)
    // A cursor is paging, not filtering: page two of everything is still
    // everything, and offering to "clear the filters" there would be a lie.
    expect(isFiltered(query({ after: 'abc' }))).toBe(false)
  })

  it.each([{ purpose: 'alignment' }, { group: '12' }, { time: '240' }, { q: 'x' }])(
    'is true for %p',
    (params) => {
      expect(isFiltered(query(params))).toBe(true)
    },
  )
})

describe('building the next address', () => {
  it('turns a value on and off again', () => {
    const on = toggleFacet({}, 'inclusivity', 'seated')
    expect(on).toBe('?inclusivity=seated')
    expect(toggleFacet({ inclusivity: 'seated' }, 'inclusivity', 'seated')).toBe(CLEARED)
  })

  it('adds to what is already chosen', () => {
    expect(toggleFacet({ inclusivity: 'seated' }, 'inclusivity', 'no_reading')).toBe(
      '?inclusivity=no_reading%2Cseated',
    )
  })

  it('keeps the other filters', () => {
    expect(toggleFacet({ purpose: 'alignment', group: '12' }, 'inclusivity', 'seated')).toContain(
      'purpose=alignment',
    )
    expect(toggleFacet({ purpose: 'alignment', group: '12' }, 'inclusivity', 'seated')).toContain(
      'group=12',
    )
  })

  it('keeps a parameter it does not understand', () => {
    // Built from the parameters rather than from the parsed query, so that
    // something a later version adds survives a click on a filter.
    expect(toggleFacet({ sort: 'newest' }, 'purpose', 'alignment')).toContain('sort=newest')
  })

  it('always drops the cursor', () => {
    // Page three of the old filter is not page three of the new one.
    expect(toggleFacet({ after: 'abc' }, 'purpose', 'alignment')).toBe('?purpose=alignment')
  })

  it('never produces an empty href', () => {
    // '' would mean "this page" to a browser and skip the navigation entirely,
    // so turning off the last chip would leave the filter on.
    expect(toggleFacet({ purpose: 'alignment' }, 'purpose', 'alignment')).toBe(CLEARED)
  })
})
