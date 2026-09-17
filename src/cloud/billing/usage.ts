/**
 * Turning recorded usage into the quantity on an invoice -- pure, so the
 * arithmetic that decides what somebody pays has a test table and no database.
 *
 * Days are Vienna calendar days, because that is where the invoice is issued
 * and what a customer reading "1 March to 31 March" means.
 */

export const BILLING_TIME_ZONE = 'Europe/Vienna'

export type Interval = { memberId: string; activeFrom: Date; activeTo: Date | null }

/** The calendar day (YYYY-MM-DD) an instant falls on in Vienna. */
export function viennaDay(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BILLING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** First day of a month, as YYYY-MM-01, and how many days it has. */
export function monthDays(month: string): string[] {
  const [year, mon] = month.split('-').map(Number) as [number, number]
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return Array.from(
    { length: count },
    (_, i) => `${year}-${String(mon).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
  )
}

/** The month before the one an instant falls in, in Vienna: YYYY-MM-01. */
export function previousMonth(instant: Date): string {
  const [year, mon] = viennaDay(instant).split('-').map(Number) as [number, number]
  const prev = mon === 1 ? { y: year - 1, m: 12 } : { y: year, m: mon - 1 }
  return `${prev.y}-${String(prev.m).padStart(2, '0')}-01`
}

/**
 * Member-months: every member counts for each day of the month on which they
 * were active at any moment, divided by the days of the month.
 *
 * A day counts once per member however often they were switched on and off.
 * Days before `billableFrom` (the end of a trial) are not counted.
 */
export function memberMonths(
  intervals: Interval[],
  month: string,
  options: { billableFrom?: Date | null; until?: Date } = {},
): number {
  const days = monthDays(month)
  const firstBillable = options.billableFrom ? viennaDay(options.billableFrom) : null
  const counted = new Set<string>()

  for (const interval of intervals) {
    const from = viennaDay(interval.activeFrom)
    const to = viennaDay(interval.activeTo ?? options.until ?? new Date())
    for (const day of days) {
      if (day < from || day > to) continue
      if (firstBillable && day < firstBillable) continue
      counted.add(`${interval.memberId}:${day}`)
    }
  }

  return Math.round((counted.size / days.length) * 100) / 100
}

/** Net amount for a quantity, rounded to the cent. */
export function netCents(quantity: number, unitNetCents: number): number {
  return Math.round(quantity * unitNetCents)
}

/** The reference that identifies one tenant's month everywhere: GW-<tenant>-YYYY-MM. */
export function invoiceRef(tenantId: string, month: string): string {
  return `GW-${tenantId.replace(/-/g, '').slice(0, 12).toUpperCase()}-${month.slice(0, 7)}`
}

/** When a failed charge is tried again: 3 days, then 7. After that it has failed for good. */
export const RETRY_AFTER_DAYS = [3, 7] as const

export function nextAttempt(attempts: number, now: Date): Date | null {
  const days = RETRY_AFTER_DAYS[attempts - 1]
  return days === undefined ? null : new Date(now.getTime() + days * 86_400_000)
}
