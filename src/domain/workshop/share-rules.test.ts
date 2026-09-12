import { describe, expect, it } from 'vitest'
import { isExpired, normaliseEmail, validUntil } from './share-rules'

/**
 * The two rules a share link lives by, without a database: when it ends, and
 * what counts as an address. Both are pure, so both get a table.
 */

const AT = (iso: string) => new Date(iso)

describe('validUntil', () => {
  it.each<[string, string | null, Date | null, string | null]>([
    // The agenda is the deadline: access ends at the start of the day after the
    // last dated day.
    ['a single dated day', '2026-09-20', null, '2026-09-21T00:00:00.000Z'],
    ['a day in the past', '2020-01-31', null, '2020-02-01T00:00:00.000Z'],
    ['the turn of a month', '2026-01-31', null, '2026-02-01T00:00:00.000Z'],
    ['a leap day', '2028-02-29', null, '2028-03-01T00:00:00.000Z'],
    ['the turn of a year', '2026-12-31', null, '2027-01-01T00:00:00.000Z'],
    // A workshop with no date has no last day to end on. Only a revocation ends
    // such a link -- a real state, not an oversight.
    ['no dated day at all', null, null, null],
    // An override is an override: it wins, in both directions, because one that
    // could only shorten could not express "keep access while we write up".
    [
      'an override before the last day',
      '2026-09-20',
      AT('2026-09-01T10:00:00.000Z'),
      '2026-09-01T10:00:00.000Z',
    ],
    [
      'an override after the last day',
      '2026-09-20',
      AT('2026-12-01T10:00:00.000Z'),
      '2026-12-01T10:00:00.000Z',
    ],
    [
      'an override with no dated day',
      null,
      AT('2026-09-01T10:00:00.000Z'),
      '2026-09-01T10:00:00.000Z',
    ],
    // Garbage out of the column does not become an invalid Date that compares
    // false against everything and silently grants access forever.
    ['an unparseable date', 'tomorrow', null, null],
  ])('%s', (_name, lastDay, explicit, expected) => {
    expect(validUntil(lastDay, explicit)?.toISOString() ?? null).toBe(expected)
  })
})

describe('isExpired', () => {
  const LAST_DAY = '2026-09-20'

  it.each<[string, string | null, Date | null, string, boolean]>([
    ['during the last day', LAST_DAY, null, '2026-09-20T16:30:00.000Z', false],
    ['a day before', LAST_DAY, null, '2026-09-19T08:00:00.000Z', false],
    // The boundary itself, both sides of it.
    ['one second before the boundary', LAST_DAY, null, '2026-09-20T23:59:59.000Z', false],
    ['exactly at the boundary', LAST_DAY, null, '2026-09-21T00:00:00.000Z', true],
    ['well after the workshop', LAST_DAY, null, '2026-10-01T09:00:00.000Z', true],
    ['an undated workshop, years later', null, null, '2099-01-01T00:00:00.000Z', false],
    [
      'an override already passed',
      LAST_DAY,
      AT('2026-09-05T00:00:00.000Z'),
      '2026-09-10T00:00:00.000Z',
      true,
    ],
  ])('%s', (_name, lastDay, explicit, now, expected) => {
    expect(isExpired(lastDay, explicit, AT(now))).toBe(expected)
  })
})

describe('normaliseEmail', () => {
  it.each([
    ['  Gast@Example.COM  ', 'gast@example.com'],
    ['gast+workshop@example.co.uk', 'gast+workshop@example.co.uk'],
  ])('normalises %s', (raw, expected) => {
    expect(normaliseEmail(raw)).toBe(expected)
  })

  it.each([
    ['empty', ''],
    ['no at sign', 'gast.example.com'],
    ['no domain dot', 'gast@example'],
    ['whitespace inside', 'gast @example.com'],
    ['two at signs', 'gast@@example.com'],
    ['only an at sign', '@'],
  ])('rejects %s', (_name, raw) => {
    // The key, not the sentence: what is asserted is which rule fired.
    expect(() => normaliseEmail(raw)).toThrow('sharing.invalidEmail')
  })
})
