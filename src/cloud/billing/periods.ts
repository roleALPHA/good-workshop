import { isPlanKey } from './plans'
import { priceAt } from './prices'
import { readPlanPrices } from './plan-prices'
import { PLANS } from './plans'
import { invoiceRef, memberMonths, monthDays, netCents, viennaDay, type Interval } from './usage'
import { taxTreatment, type VatStatus } from '@/cloud/tax/treatment'
import { DAY, type Db, type RunOptions } from './context'

/**
 * Closing a month.
 *
 * A period is the unit everything after this works on: it fixes how many member
 * months were used, at which price, under which tax treatment. Idempotent by
 * construction -- the insert names the state it expects -- so two workers or one
 * restarted worker cannot bill a month twice.
 *
 * The month boundaries are Vienna calendar days, not UTC. The worker runs every
 * ten minutes and therefore also in the hour where the two disagree.
 */

/** Computes the period of `month` (YYYY-MM-01) for every tenant that has one. Idempotent. */
export async function closeMonth(db: Db, month: string, options: RunOptions): Promise<number> {
  const days = monthDays(month)
  // A day's margin on either side: which Vienna day an instant belongs to is
  // decided by memberMonths, this only has to fetch everything that could.
  const windowStart = new Date(new Date(`${days[0]}T00:00:00Z`).getTime() - DAY)
  const monthEnd = new Date(new Date(`${days.at(-1)}T23:59:59Z`).getTime() + DAY)

  const { rows: accounts } = await db.query(
    `select b.tenant_id, b.country, b.vat_status, b.plan,
            l.trial_ends_at
       from billing_account b
       join tenant_lifecycle l on l.tenant_id = b.tenant_id
      where not exists (select 1 from billing_period p where p.tenant_id = b.tenant_id and p.month = $1)
        and (l.trial_ends_at is null or l.trial_ends_at <= $2)`,
    [month, monthEnd],
  )

  const prices = await readPlanPrices(db)

  let created = 0
  for (const account of accounts) {
    const planKey: unknown = account.plan
    if (!isPlanKey(planKey)) continue
    const plan = PLANS[planKey]
    const billableFrom: Date | null = account.trial_ends_at

    let quantity: number
    if (plan.key === 'per_user') {
      const { rows } = await db.query(
        `select member_id, active_from, active_to from usage_member_interval
          where tenant_id = $1 and active_from <= $3 and (active_to is null or active_to >= $2)`,
        [account.tenant_id, windowStart, monthEnd],
      )
      const intervals: Interval[] = rows.map((row) => ({
        memberId: row.member_id,
        activeFrom: row.active_from,
        activeTo: row.active_to,
      }))
      quantity = memberMonths(intervals, month, { billableFrom, until: options.now })
    } else {
      const { rows } = await db.query(
        `select created_at from usage_workshop_created where tenant_id = $1 and not in_trial`,
        [account.tenant_id],
      )
      quantity = rows.filter((row) => {
        const day = viennaDay(row.created_at)
        return (
          day.slice(0, 7) === month.slice(0, 7) && (!billableFrom || row.created_at >= billableFrom)
        )
      }).length
    }

    const tax = taxTreatment({
      country: account.country,
      vatStatus: account.vat_status as VatStatus,
    })
    // The price in force when the month began -- not the one in force now, in
    // the month after it. A raise announced for October leaves September alone.
    const unitNetCents = priceAt(prices, plan.key, month)
    if (unitNetCents === null) {
      options.log('billing: no price for this month', { tenant: account.tenant_id, month })
      continue
    }
    const net = netCents(quantity, unitNetCents)

    const [status, holdReason] =
      net === 0
        ? ['void', null]
        : tax.kind === 'hold'
          ? ['held', tax.reason]
          : net > options.maxInvoiceCents
            ? ['held', 'over_limit']
            : ['computed', null]

    const inserted = await db.query(
      `insert into billing_period
         (tenant_id, month, plan, quantity, unit_net_cents, net_cents, tax_kind, tax_country,
          tax_rate, status, hold_reason, invoice_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (tenant_id, month) do nothing`,
      [
        account.tenant_id,
        month,
        plan.key,
        quantity,
        unitNetCents,
        net,
        tax.kind,
        'country' in tax ? tax.country : null,
        'rate' in tax ? tax.rate : null,
        status,
        holdReason,
        invoiceRef(account.tenant_id, month),
      ],
    )
    created += inserted.rowCount ?? 0
  }

  // A plan chosen during a month applies from the next one; the month just
  // closed was billed under the old plan, the one now running is the new one's.
  //
  // The date decides, not the fact that a month was closed: this runs on every
  // pass of the worker, ten minutes apart, and without `next_plan_from` a plan
  // chosen on the 15th was live within minutes and backdated to the first.
  await db.query(
    `update billing_account
        set plan = next_plan, next_plan = null, next_plan_from = null,
            plan_from = next_plan_from, updated_at = now()
      where next_plan is not null
        and next_plan_from <= date_trunc('month', $1::timestamptz at time zone 'Europe/Vienna')::date`,
    [options.now],
  )
  options.log('billing: month closed', { month, periods: created })
  return created
}
