import { PLAN_KEYS, isPlanKey } from './plans'
import { nextChangeMonth, priceAt, type PlanPrice } from './prices'
import type { PlanKey } from './plans'
import type { BillingAdapters } from './ports'
import { announce, localeOf, type Db, type RunOptions } from './context'

/**
 * What a plan costs, as the accounting system says it does.
 *
 * The prices are not ours to invent: Odoo holds them, and this step copies each
 * change into `plan_price` so that a month already closed keeps the price it was
 * closed at. A price is a row per change rather than a column, because an invoice
 * issued last March has to stay explicable next March.
 *
 * A change is announced before it applies (§ 4.7, PRICE_NOTICE_DAYS), which is
 * why recording one and telling about it are the same step: a price that arrived
 * without a notice going out would be a price we may not charge.
 */

/** Every price ever in force. Few rows: two plans, one row per change. */
export async function readPlanPrices(db: Db): Promise<PlanPrice[]> {
  const { rows } = await db.query(
    `select plan, net_cents, to_char(effective_from, 'YYYY-MM-DD') as effective_from
       from plan_price order by effective_from`,
  )
  return rows
    .filter((row) => isPlanKey(row.plan))
    .map((row) => ({
      plan: row.plan,
      netCents: Number(row.net_cents),
      effectiveFrom: row.effective_from,
    }))
}

/**
 * Asks the accounting system what the articles cost, and records a change from
 * the first of the coming month.
 *
 * A change never reaches the month that is running: existing customers are told
 * about a raise beforehand, and this is where that promise is kept. The time of
 * the answer is recorded either way -- a price nobody could confirm for a day
 * stops new orders (see prices.ts).
 */
export async function syncPlanPrices(
  db: Db,
  adapters: BillingAdapters,
  options: RunOptions,
): Promise<void> {
  const prices = await readPlanPrices(db)
  const from = nextChangeMonth(options.now)
  try {
    for (const plan of PLAN_KEYS) {
      const netCents = await adapters.invoicing.planPrice(plan)
      if (!Number.isInteger(netCents) || netCents < 0) {
        throw new Error(`accounting returned ${netCents} for ${plan}`)
      }
      const announced = priceAt(prices, plan, from)
      if (announced === netCents) continue
      await db.query(
        `insert into plan_price (plan, net_cents, effective_from)
         values ($1, $2, $3)
         on conflict (plan, effective_from) do update set net_cents = excluded.net_cents,
                                                          recorded_at = now()`,
        [plan, netCents, from],
      )
      options.log('billing: price change recorded', { plan, netCents, from })
      await announcePriceChange(db, plan, netCents, from, options)
    }
    await db.query(`update plan_price_sync set checked_at = now(), last_error = null`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.query(`update plan_price_sync set last_error = $1`, [message])
    options.log('billing: could not read prices from accounting', { error: message })
  }
}

/**
 * Tells everybody it concerns, once, six weeks before it applies.
 *
 * AGB § 4.7 promises the notice and a right to end the contract over it, and
 * neither is worth anything if nobody is told. Once per workspace and per
 * announced month: the run passes every ten minutes, and `plan_price` is
 * updated rather than appended when accounting corrects itself before the date
 * arrives.
 */
async function announcePriceChange(
  db: Db,
  plan: PlanKey,
  netCents: number,
  from: string,
  options: RunOptions,
) {
  const { rows } = await db.query(
    `select b.tenant_id, b.billing_email, b.locale
       from billing_account b
       join tenant_lifecycle l on l.tenant_id = b.tenant_id
      where b.plan = $1 and l.state not in ('deleting')
        and not exists (select 1 from price_change_notice n
                         where n.tenant_id = b.tenant_id and n.plan = $1 and n.effective_from = $2)`,
    [plan, from],
  )

  for (const tenant of rows) {
    const marked = await db.query(
      `insert into price_change_notice (tenant_id, plan, effective_from, net_cents)
       values ($1, $2, $3, $4) on conflict do nothing returning tenant_id`,
      [tenant.tenant_id, plan, from, netCents],
    )
    if (!marked.rowCount) continue
    await announce(options, {
      kind: 'price_change',
      to: tenant.billing_email,
      locale: localeOf(tenant.locale),
      plan,
      netCents,
      from,
    })
  }
}
