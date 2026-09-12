import { MINUTES_PER_DAY } from '@/domain/schedule/types'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'
import { DURATION_VOCABULARY, type DurationVocabulary } from './duration-vocabulary'

const MAX_DURATION_MINUTES = MINUTES_PER_DAY

/** `1:30`, `0:45` -- clock notation, and the same in every language. */
const COLON = /^(\d{1,2}):(\d{1,2})$/

/** Longest first, so `minuten` is not matched as `min` with `uten` left over. */
const alternatives = (words: readonly string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')

/**
 * Built once per vocabulary rather than written out four times.
 *
 * `\.?` after the word keeps the abbreviations somebody actually types --
 * `Std.`, `min.` -- working without listing each twice.
 */
const patternsFor = (vocabulary: DurationVocabulary) => {
  const hours = alternatives(vocabulary.hour)
  const minutes = alternatives(vocabulary.minute)
  return {
    /** `1h30`, `1h 30m`, `2 h`, `1Std`, `1,5h` -- hours with an optional minute tail. */
    hoursAndMinutes: new RegExp(
      `^(\\d+(?:[.,]\\d+)?)\\s*(?:${hours})\\.?\\s*(?:(\\d{1,2})\\s*(?:${minutes})?\\.?)?$`,
      'i',
    ),
    /** `45`, `45m`, `45 min`, `45 Minuten` -- plain minutes. */
    minutesOnly: new RegExp(`^(\\d+)\\s*(?:${minutes})?\\.?$`, 'i'),
  }
}

const PATTERNS: Record<Locale, ReturnType<typeof patternsFor>> = {
  de: patternsFor(DURATION_VOCABULARY.de),
  en: patternsFor(DURATION_VOCABULARY.en),
  fr: patternsFor(DURATION_VOCABULARY.fr),
  es: patternsFor(DURATION_VOCABULARY.es),
}

/**
 * Parses the many ways a facilitator types a duration into whole minutes.
 *
 * This is the most-used control in the app, so it is permissive about input and
 * strict about output: anything it cannot interpret unambiguously returns null
 * rather than a plausible-looking guess. Trailing garbage is a rejection, not
 * something to skip past -- `1h30x` is far more likely a typo than an intent.
 *
 * @param locale which language's words to accept alongside the neutral forms
 * @returns whole minutes in [0, 1440], or null if the input is not a duration
 */
export function parseDuration(input: string, locale: Locale = DEFAULT_LOCALE): number | null {
  const value = input.trim()
  if (value === '') return null

  const minutes = matchMinutes(value, PATTERNS[locale])
  if (minutes === null) return null
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_DURATION_MINUTES) return null

  return Math.round(minutes)
}

function matchMinutes(value: string, patterns: ReturnType<typeof patternsFor>): number | null {
  const colon = COLON.exec(value)
  if (colon) {
    const hours = Number(colon[1])
    const mins = Number(colon[2])
    if (mins > 59) return null
    return hours * 60 + mins
  }

  const hm = patterns.hoursAndMinutes.exec(value)
  if (hm) {
    const hours = Number(hm[1]!.replace(',', '.'))
    const mins = hm[2] === undefined ? 0 : Number(hm[2])
    if (mins > 59) return null
    return hours * 60 + mins
  }

  const m = patterns.minutesOnly.exec(value)
  if (m) return Number(m[1])

  return null
}

/**
 * `45m`, `1h`, `1h30m`. The compact form is what the agenda row shows in bold
 * next to the start time; the spaced form reads better in headers and totals.
 */
export function formatDuration(minutes: number, opts: { spaced?: boolean } = {}): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const mins = total % 60

  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h${opts.spaced ? ' ' : ''}${mins}m`
}

/**
 * Clock formatters, one per language, built once.
 *
 * Constructing an `Intl.DateTimeFormat` is expensive and `formatTime` runs once
 * per agenda row, per render.
 *
 * The option differs by language on purpose. German, French and Spanish use a
 * 24-hour clock, and `2-digit` keeps `09:00` two characters wide so the time
 * column stays aligned next to `tabular-nums` -- which is also byte-for-byte
 * what this function produced before it knew about languages. English is a
 * 12-hour clock, and `09:00 AM` is not how anybody writes half past nine, so it
 * gets `numeric` and reads `9:00 AM`.
 */
const CLOCKS: Record<Locale, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat('de', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
  en: new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }),
  fr: new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
  es: new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
}

/**
 * `09:00` in German, `9:00 AM` in English -- and `01:30 (+1)` once the day runs
 * past midnight. Wrapping silently would make an evening workshop look like it
 * starts before it ends.
 *
 * The locale is REQUIRED rather than defaulted. Four of the thirteen call sites
 * are server code with no request context -- the Markdown exporter, the print
 * page, MCP -- and a forgotten argument there would fall back to German in a
 * timetable, which is exactly the kind of wrong nobody notices.
 */
export function formatTime(minuteOfTimeline: number, locale: Locale): string {
  const total = Math.round(minuteOfTimeline)
  const dayOffset = Math.floor(total / MINUTES_PER_DAY)
  const withinDay = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY

  // A fixed UTC instant, so no installation's time zone or DST rule can shift
  // a minute count that is not an instant in the first place.
  const clock = CLOCKS[locale].format(
    new Date(Date.UTC(2000, 0, 1, Math.floor(withinDay / 60), withinDay % 60)),
  )

  return dayOffset === 0 ? clock : `${clock} (${dayOffset > 0 ? '+' : ''}${dayOffset})`
}
