import { describe, expect, it } from 'vitest'
import {
  blockAfter,
  DUNNING_GRACE_DAYS,
  invoiceLocaleOf,
  invoiceRef,
  memberMonths,
  invoiceLine,
  monthDays,
  monthKey,
  netCents,
  nextAttempt,
  previousMonth,
  viennaDay,
  type Interval,
} from './usage'

const at = (iso: string) => new Date(iso)
const member = (memberId: string, from: string, to: string | null): Interval => ({
  memberId,
  activeFrom: at(from),
  activeTo: to ? at(to) : null,
})

describe('calendar', () => {
  it.each([
    ['2026-02-01', 28],
    ['2028-02-01', 29],
    ['2026-03-01', 31],
    ['2026-04-01', 30],
  ])('%s has %i days', (month, count) => {
    expect(monthDays(month)).toHaveLength(count)
  })

  it('counts days in Vienna, not in UTC', () => {
    // 23:30 UTC on 31 March is already 1 April in Vienna (summer time).
    expect(viennaDay(at('2026-03-31T23:30:00Z'))).toBe('2026-04-01')
    expect(viennaDay(at('2026-01-31T23:30:00Z'))).toBe('2026-02-01')
  })

  /**
   * The offset is one hour in winter and two in summer, and the worker runs
   * every ten minutes -- so it runs inside both of the windows where the UTC
   * day and the Vienna day disagree. Which month a run closes is decided here.
   */
  it.each([
    // Winter, UTC+1: an hour before midnight UTC is already tomorrow.
    ['2026-12-31T23:00:00Z', '2027-01-01'],
    ['2026-12-31T22:59:00Z', '2026-12-31'],
    // Summer, UTC+2: two hours before.
    ['2026-06-30T22:00:00Z', '2026-07-01'],
    ['2026-06-30T21:59:00Z', '2026-06-30'],
    // The night the clocks go forward: 02:00 becomes 03:00 local.
    ['2026-03-29T00:30:00Z', '2026-03-29'],
    ['2026-03-29T22:30:00Z', '2026-03-30'],
    // And back: 03:00 becomes 02:00 local.
    ['2026-10-25T00:30:00Z', '2026-10-25'],
    ['2026-10-25T23:30:00Z', '2026-10-26'],
  ])('%s falls on %s in Vienna', (instant, day) => {
    expect(viennaDay(at(instant))).toBe(day)
  })

  it.each([
    ['2026-03-01T10:00:00Z', '2026-02-01'],
    ['2026-01-01T00:30:00Z', '2025-12-01'],
    ['2025-12-31T23:30:00Z', '2025-12-01'],
    // 00:30 in Vienna on New Year's Day is 23:30 UTC on New Year's Eve. The
    // run that happens then has to close December, not November.
    ['2026-12-31T23:30:00Z', '2026-12-01'],
    // The first run of a month that begins with a clock change.
    ['2026-04-01T00:30:00Z', '2026-03-01'],
    ['2026-11-01T00:30:00Z', '2026-10-01'],
  ])('the month before %s is %s', (now, expected) => {
    expect(previousMonth(at(now))).toBe(expected)
  })
})

describe('memberMonths', () => {
  const march = '2026-03-01'
  const end = at('2026-04-01T12:00:00Z')

  it.each([
    ['nobody', [], 0],
    ['one member all month', [member('a', '2026-01-01T00:00:00Z', null)], 1],
    [
      'two members all month',
      [member('a', '2026-01-01T00:00:00Z', null), member('b', '2026-02-10T00:00:00Z', null)],
      2,
    ],
    ['joined on the 16th', [member('a', '2026-03-16T09:00:00Z', null)], 0.52],
    ['left on the 10th', [member('a', '2026-01-01T00:00:00Z', '2026-03-10T15:00:00Z')], 0.32],
    [
      'off and on the same day counts once',
      [
        member('a', '2026-03-01T08:00:00Z', '2026-03-05T10:00:00Z'),
        member('a', '2026-03-05T11:00:00Z', null),
      ],
      1,
    ],
    ['a member for one hour', [member('a', '2026-03-20T10:00:00Z', '2026-03-20T11:00:00Z')], 0.03],
    [
      'active only before the month',
      [member('a', '2026-01-01T00:00:00Z', '2026-02-28T12:00:00Z')],
      0,
    ],
  ])('%s → %s', (_, intervals, expected) => {
    expect(memberMonths(intervals as Interval[], march, { until: end })).toBe(expected)
  })

  it('leaves out the trial', () => {
    const intervals = [member('a', '2026-01-01T00:00:00Z', null)]
    expect(
      memberMonths(intervals, march, { billableFrom: at('2026-03-15T10:00:00Z'), until: end }),
    ).toBe(0.55)
  })

  it('counts a leap February by its 29 days', () => {
    expect(
      memberMonths([member('a', '2028-02-15T12:00:00Z', null)], '2028-02-01', {
        until: at('2028-03-02T00:00:00Z'),
      }),
    ).toBe(0.52)
  })
})

describe('amounts and references', () => {
  it.each([
    [1, 100, 100],
    [0.52, 100, 52],
    [2.335, 100, 234],
    [0, 100, 0],
  ])('%s × %i cents = %i cents', (quantity, unit, expected) => {
    expect(netCents(quantity, unit)).toBe(expected)
  })

  it('names one tenant’s month', () => {
    expect(invoiceRef('0198a2b3-c4d5-7e6f-8a9b-0c1d2e3f4a5b', '2026-03-01')).toBe(
      'GW-0198A2B3C4D5-2026-03',
    )
  })

  it('retries a failed charge after three and seven days, then gives up', () => {
    const now = at('2026-04-02T10:00:00Z')
    expect(nextAttempt(1, now)).toEqual(at('2026-04-05T10:00:00Z'))
    expect(nextAttempt(2, now)).toEqual(at('2026-04-09T10:00:00Z'))
    expect(nextAttempt(3, now)).toBeNull()
  })

  it('names the day the access may be blocked, two weeks after the reminder', () => {
    // AGB § 5.4 gives the customer this span, and the reminder mail states the
    // date -- so the number is part of what was promised, not a tuning knob.
    expect(DUNNING_GRACE_DAYS).toBe(14)
    expect(blockAfter(at('2026-04-02T10:00:00Z'))).toEqual(at('2026-04-16T10:00:00Z'))
    // Across a clock change the span stays fourteen times 24 hours; the
    // customer is never given a shorter one.
    expect(blockAfter(at('2026-03-20T10:00:00Z'))).toEqual(at('2026-04-03T10:00:00Z'))
  })
})

describe('the language an invoice is written in', () => {
  /**
   * Mails exist in four languages, invoices in two: the accounting system
   * renders German and English. The rule is "everything that is not German is
   * English", and it is written down here rather than left to be rediscovered
   * from a switch statement.
   */
  it.each([
    ['de', 'de'],
    ['en', 'en'],
    ['fr', 'en'],
    ['es', 'en'],
    // Nothing else is ever stored -- billing_account.locale has a check
    // constraint -- but a column that gains a value must not silently pick a
    // language for somebody.
    ['de-AT', 'en'],
    ['DE', 'en'],
    [null, 'en'],
    [undefined, 'en'],
  ])('%s is invoiced in %s', (stored, expected) => {
    expect(invoiceLocaleOf(stored)).toBe(expected)
  })
})

describe('the month an invoice line names', () => {
  it('is YYYY-MM, whether it arrives as text or as the date the driver hands back', () => {
    expect(monthKey('2026-08-01')).toBe('2026-08')
    // What `select month from billing_period` yields is a Date at local
    // midnight. `String(...)` renders that as "Sat Aug 01 2026 ...", and seven
    // characters of it is "Sat Aug" -- which is what stood on every invoice.
    expect(monthKey(new Date(2026, 7, 1))).toBe('2026-08')
    expect(monthKey(new Date(2026, 0, 1))).toBe('2026-01')
  })
})

describe('what an invoice line says', () => {
  /**
   * The line replaces the article's name in the accounting system, so it has
   * to stand on its own: what was used, and for which month. It used to read
   * "GoodWorkshop per_user Sat Aug" -- a key meant for code, and a weekday
   * where the month belonged.
   */
  it('names the unit and the month in German', () => {
    expect(invoiceLine('user_month', '2026-08-01', 'de')).toBe(
      'GoodWorkshop — Benutzer-Monate, August 2026',
    )
    expect(invoiceLine('workshop', '2026-01-01', 'de')).toBe(
      'GoodWorkshop — angelegte Workshops, Jänner 2026',
    )
  })

  it('and in English for everybody else', () => {
    expect(invoiceLine('user_month', new Date(2026, 7, 1), 'en')).toBe(
      'GoodWorkshop — user-months, August 2026',
    )
    expect(invoiceLine('workshop', '2026-12-01', 'en')).toBe(
      'GoodWorkshop — workshops created, December 2026',
    )
  })

  /**
   * All twelve, because the two that are wrong are wrong in one language only:
   * January is Jänner on an invoice issued in Austria, and a month name taken
   * from a Date is a weekday.
   */
  it.each([
    [1, 'Jänner 2026', 'January 2026'],
    [2, 'Februar 2026', 'February 2026'],
    [3, 'März 2026', 'March 2026'],
    [4, 'April 2026', 'April 2026'],
    [5, 'Mai 2026', 'May 2026'],
    [6, 'Juni 2026', 'June 2026'],
    [7, 'Juli 2026', 'July 2026'],
    [8, 'August 2026', 'August 2026'],
    [9, 'September 2026', 'September 2026'],
    [10, 'Oktober 2026', 'October 2026'],
    [11, 'November 2026', 'November 2026'],
    [12, 'Dezember 2026', 'December 2026'],
  ])('month %i is %s in German and %s in English', (month, german, english) => {
    const first = `2026-${String(month).padStart(2, '0')}-01`
    expect(invoiceLine('user_month', first, 'de')).toBe(`GoodWorkshop — Benutzer-Monate, ${german}`)
    expect(invoiceLine('user_month', first, 'en')).toBe(`GoodWorkshop — user-months, ${english}`)
    // Also from the Date the driver hands back for a `date` column.
    expect(invoiceLine('workshop', new Date(2026, month - 1, 1), 'de')).toBe(
      `GoodWorkshop — angelegte Workshops, ${german}`,
    )
  })

  it('never leaks a plan key or a weekday', () => {
    for (const locale of ['de', 'en'] as const) {
      for (const unit of ['user_month', 'workshop'] as const) {
        const line = invoiceLine(unit, '2026-08-01', locale)
        expect(line).not.toMatch(/per_user|per_workshop|\b(Sat|Sun|Mon|Tue|Wed|Thu|Fri)\b/)
      }
    }
  })
})
