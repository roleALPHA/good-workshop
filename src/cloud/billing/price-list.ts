import { sql } from 'drizzle-orm'
import { withoutTenant } from '@/server/db'
import { PLAN_KEYS, type PlanKey } from './plans'
import { currentPrice, isStale, type PlanPrice } from './prices'

/**
 * What the website and the registration may say a plan costs.
 *
 * The rows come from the accounting system, written by the billing worker --
 * the web container has no access there and needs none. What it does have is
 * the age of the last answer, and it refuses to sell on a price nobody has
 * confirmed for a day: a wrong price on an order form is worse than no form.
 */

export type PriceList = {
  /** Net cents per plan, or null when there is no price to show. */
  prices: Record<PlanKey, number | null>
  /** False when the accounting system has been silent for too long. */
  sellable: boolean
}

export async function readPriceList(now = new Date()): Promise<PriceList> {
  const { rows, checkedAt } = await withoutTenant(async (tx) => {
    const priceRows = (await tx.execute(
      sql`select plan, net_cents, to_char(effective_from, 'YYYY-MM-DD') as effective_from
            from plan_price order by effective_from`,
    )) as unknown as { rows: Record<string, unknown>[] }
    const syncRows = (await tx.execute(sql`select checked_at from plan_price_sync`)) as unknown as {
      rows: { checked_at: unknown }[]
    }
    return { rows: priceRows.rows, checkedAt: syncRows.rows[0]?.checked_at ?? null }
  })

  const prices = rows.map((row): PlanPrice => ({
    plan: row['plan'] as PlanKey,
    netCents: Number(row['net_cents']),
    effectiveFrom: String(row['effective_from']),
  }))

  const list = Object.fromEntries(
    PLAN_KEYS.map((plan) => [plan, currentPrice(prices, plan, now)]),
  ) as Record<PlanKey, number | null>

  // Drizzle's raw queries hand timestamps back as strings.
  const lastCheck = checkedAt ? new Date(checkedAt as string) : null
  const complete = PLAN_KEYS.every((plan) => list[plan] !== null)

  return { prices: list, sellable: complete && !isStale(lastCheck, now) }
}
