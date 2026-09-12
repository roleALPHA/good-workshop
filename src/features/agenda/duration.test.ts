import { describe, expect, it } from 'vitest'
import { formatDuration, formatTime, parseDuration } from './duration'

describe('parseDuration', () => {
  it.each([
    // bare numbers are minutes -- the overwhelmingly common case
    ['45', 45],
    ['90', 90],
    ['0', 0],
    ['  30  ', 30],
    // minute suffixes
    ['45m', 45],
    ['45 m', 45],
    ['45min', 45],
    ['45 Min', 45],
    ['45 minuten', 45],
    // hour suffixes
    ['1h', 60],
    ['2 h', 120],
    ['1Std', 60],
    ['1 std.', 60],
    // combined
    ['1h30', 90],
    ['1h30m', 90],
    ['2h 15m', 135],
    ['1 h 5 min', 65],
    // colon notation
    ['1:30', 90],
    ['0:45', 45],
    ['1:05', 65],
    ['1:5', 65],
    // decimals, both separators -- German keyboards produce the comma
    ['1.5h', 90],
    ['1,5h', 90],
    ['0,25h', 15],
    // upper bound is exactly one day
    ['24h', 1440],
    ['1440', 1440],
  ])('parses %j as %i minutes', (input, expected) => {
    expect(parseDuration(input)).toBe(expected)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['abc', 'letters'],
    ['-5', 'negative'],
    ['-1h', 'negative hours'],
    ['1441', 'over one day'],
    ['25h', 'over one day in hours'],
    ['1h30x', 'trailing garbage'],
    [':30', 'missing hour part'],
    ['1:', 'missing minute part'],
    ['1:60', 'minutes out of range'],
    ['1:130', 'three-digit minutes'],
    ['h', 'unit without number'],
    ['1h2h', 'repeated unit'],
    ['NaN', 'the string NaN'],
    ['Infinity', 'infinity'],
    ['1e3', 'exponent notation'],
  ])('rejects %j (%s)', (input) => {
    expect(parseDuration(input)).toBeNull()
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [5, '5m'],
    [45, '45m'],
    [60, '1h'],
    [90, '1h30m'],
    [65, '1h5m'],
    [430, '7h10m'],
    [1440, '24h'],
  ])('formats %i as %j', (input, expected) => {
    expect(formatDuration(input)).toBe(expected)
  })

  it('can render a spaced variant for headers and summaries', () => {
    expect(formatDuration(430, { spaced: true })).toBe('7h 10m')
    expect(formatDuration(45, { spaced: true })).toBe('45m')
  })

  it('round-trips through parseDuration', () => {
    for (const minutes of [0, 5, 45, 60, 65, 90, 430, 1440]) {
      expect(parseDuration(formatDuration(minutes))).toBe(minutes)
    }
  })
})

describe('formatTime', () => {
  it.each([
    [0, '00:00'],
    [540, '09:00'],
    [780, '13:00'],
    [1439, '23:59'],
  ])('formats %i as %j', (input, expected) => {
    expect(formatTime(input, 'de')).toBe(expected)
  })

  it('marks times that spill past midnight rather than wrapping silently', () => {
    expect(formatTime(1440, 'de')).toBe('00:00 (+1)')
    expect(formatTime(1530, 'de')).toBe('01:30 (+1)')
    expect(formatTime(2970, 'de')).toBe('01:30 (+2)')
  })

  /**
   * The timetable convention differs, and the column has to survive it.
   *
   * German, French and Spanish keep the 24-hour clock and the leading zero, so
   * the time column stays two characters wide next to `tabular-nums`. English
   * is a 12-hour clock, and `09:00 AM` is not how anybody writes half past
   * nine.
   */
  it.each([
    ['de', '09:00'],
    ['fr', '09:00'],
    ['es', '09:00'],
  ] as const)('keeps a 24-hour clock in %s', (locale, expected) => {
    expect(formatTime(540, locale)).toBe(expected)
  })

  it('uses a 12-hour clock in English', () => {
    expect(formatTime(540, 'en')).toMatch(/^9:00\s*AM$/)
    expect(formatTime(870, 'en')).toMatch(/^2:30\s*PM$/)
  })

  it('keeps the day-offset marker in every language', () => {
    expect(formatTime(1530, 'en')).toMatch(/\(\+1\)$/)
    expect(formatTime(1530, 'fr')).toBe('01:30 (+1)')
  })
})

describe('parseDuration across languages', () => {
  /** The neutral core is accepted everywhere, so no language is worse served. */
  it.each(['de', 'en', 'fr', 'es'] as const)('accepts the neutral forms in %s', (locale) => {
    expect(parseDuration('90', locale)).toBe(90)
    expect(parseDuration('1:30', locale)).toBe(90)
    expect(parseDuration('1h30', locale)).toBe(90)
    expect(parseDuration('1.5h', locale)).toBe(90)
    // The decimal comma is accepted everywhere, not per language: three of the
    // four use it, and `1,5` has no other reading as a duration under English.
    expect(parseDuration('1,5h', locale)).toBe(90)
  })

  it.each([
    ['de', '1 Stunde 30 Minuten'],
    ['en', '1 hour 30 minutes'],
    ['fr', '1 heure 30 minutes'],
    ['es', '1 hora 30 minutos'],
  ] as const)('accepts the words of %s', (locale, input) => {
    expect(parseDuration(input, locale)).toBe(90)
  })

  /**
   * The assertion that keeps the four vocabularies from merging into one
   * permissive blob. A parser that accepts everything everywhere is not
   * multilingual, it is just loose.
   */
  it("does not accept another language's words", () => {
    expect(parseDuration('1 Stunde', 'en')).toBeNull()
    expect(parseDuration('1 hour', 'de')).toBeNull()
    expect(parseDuration('90 minutos', 'fr')).toBeNull()
  })
})
