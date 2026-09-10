import { MINUTES_PER_DAY } from '@/domain/schedule/types'

const MAX_DURATION_MINUTES = MINUTES_PER_DAY

/** `1h30`, `1h 30m`, `2 h`, `1Std`, `1,5h` -- hours with an optional minute tail. */
const HOURS_AND_MINUTES =
  /^(\d+(?:[.,]\d+)?)\s*(?:h|std\.?|stunden?)\s*(?:(\d{1,2})\s*(?:m|min\.?|minuten?)?)?$/i

/** `45`, `45m`, `45 min`, `45 Minuten` -- plain minutes. */
const MINUTES_ONLY = /^(\d+)\s*(?:m|min\.?|minuten?)?$/i

/** `1:30`, `0:45` -- clock notation. */
const COLON = /^(\d{1,2}):(\d{1,2})$/

/**
 * Parses the many ways a facilitator types a duration into whole minutes.
 *
 * This is the most-used control in the app, so it is permissive about input and
 * strict about output: anything it cannot interpret unambiguously returns null
 * rather than a plausible-looking guess. Trailing garbage is a rejection, not
 * something to skip past -- `1h30x` is far more likely a typo than an intent.
 *
 * @returns whole minutes in [0, 1440], or null if the input is not a duration
 */
export function parseDuration(input: string): number | null {
  const value = input.trim()
  if (value === '') return null

  const minutes = matchMinutes(value)
  if (minutes === null) return null
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_DURATION_MINUTES) return null

  return Math.round(minutes)
}

function matchMinutes(value: string): number | null {
  const colon = COLON.exec(value)
  if (colon) {
    const hours = Number(colon[1])
    const mins = Number(colon[2])
    if (mins > 59) return null
    return hours * 60 + mins
  }

  const hm = HOURS_AND_MINUTES.exec(value)
  if (hm) {
    const hours = Number(hm[1]!.replace(',', '.'))
    const mins = hm[2] === undefined ? 0 : Number(hm[2])
    if (mins > 59) return null
    return hours * 60 + mins
  }

  const m = MINUTES_ONLY.exec(value)
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
 * `09:00`, and `01:30 (+1)` once the day runs past midnight. Wrapping silently
 * would make an evening workshop look like it starts before it ends.
 */
export function formatTime(minuteOfTimeline: number): string {
  const total = Math.round(minuteOfTimeline)
  const dayOffset = Math.floor(total / MINUTES_PER_DAY)
  const withinDay = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY

  const hh = String(Math.floor(withinDay / 60)).padStart(2, '0')
  const mm = String(withinDay % 60).padStart(2, '0')
  const clock = `${hh}:${mm}`

  return dayOffset === 0 ? clock : `${clock} (${dayOffset > 0 ? '+' : ''}${dayOffset})`
}
