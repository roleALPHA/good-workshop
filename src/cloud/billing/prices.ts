import type { PlanKey } from './plans'

/**
 * What a plan costs, from the accounting system.
 *
 * The price of an article lives in Odoo, because it has to be there for the
 * invoice. Keeping a second copy in the code meant keeping it in five places,
 * and the registration page went on advertising one euro after the price had
 * gone to five. So the worker reads the article price and records it here, and
 * everything that shows or bills a price reads these rows.
 *
 * What stays in plans.ts is what the accounting system does not know: that a
 * user month is counted by the day, and that a workshop counts once when it is
 * created.
 */

export type PlanPrice = {
  plan: PlanKey
  netCents: number
  /** Always the first of a month, as an ISO date. */
  effectiveFrom: string
}

/** How long a price may go unconfirmed before we stop taking new orders on it. */
export const MAX_PRICE_AGE_MS = 24 * 60 * 60 * 1000

/**
 * The price a month is billed at: the one in force when the month began.
 *
 * Not the one in force when the run happens -- that run is in the following
 * month, and a raise announced for October must not reach September's invoice.
 */
export function priceAt(prices: PlanPrice[], plan: PlanKey, monthStart: string): number | null {
  const inForce = prices
    .filter((price) => price.plan === plan && price.effectiveFrom <= monthStart)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .at(-1)
  return inForce?.netCents ?? null
}

/** The price to show and to sell at today. */
export function currentPrice(prices: PlanPrice[], plan: PlanKey, now = new Date()): number | null {
  return priceAt(prices, plan, now.toISOString().slice(0, 10))
}

/**
 * Six weeks, because that is what AGB § 4.7 promises before a price change
 * takes effect -- and what the customer's right to end the contract over it
 * needs to be worth anything.
 */
export const PRICE_NOTICE_DAYS = 42

/**
 * When a price changed in the accounting system may take effect: the first of
 * the first month that is at least six weeks away.
 *
 * It used to be the first of the coming month, which on the 20th is eleven
 * days -- the promise was in the terms and nowhere else. Now the date itself
 * carries it: a change recorded today cannot start before the notice period is
 * over, whatever anybody remembers to send.
 */
export function nextChangeMonth(now = new Date()): string {
  const earliest = new Date(now.getTime() + PRICE_NOTICE_DAYS * 86_400_000)
  const next = new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth() + 1, 1))
  return next.toISOString().slice(0, 10)
}

/**
 * Whether the last answer from the accounting system is too old to sell on.
 * Never asked counts as too old: an installation that cannot reach accounting
 * must not invent a price.
 */
export function isStale(checkedAt: Date | null, now = new Date()): boolean {
  if (!checkedAt) return true
  return now.getTime() - checkedAt.getTime() > MAX_PRICE_AGE_MS
}
