import { PLANS, PLAN_KEYS, isPlanKey } from './plans'
import { nextChangeMonth, priceAt, type PlanPrice } from './prices'
import type { BillingAdapters, IssuedInvoice, PaymentEvent } from './ports'
import {
  invoiceRef,
  memberMonths,
  monthDays,
  netCents,
  nextAttempt,
  previousMonth,
  viennaDay,
  type Interval,
} from './usage'
import { taxTreatment, type VatStatus } from '@/cloud/tax/treatment'
import type { VatCheck } from '@/cloud/tax/vies'

/**
 * The billing run: from recorded usage to a paid invoice, in steps that can each
 * be repeated.
 *
 * Every step reads what state a period is in and moves it one state further with
 * an update that names the state it expects, so two workers -- or one worker
 * restarted halfway -- cannot bill a month twice. Towards the outside world the
 * invoice reference is the idempotency key: a repeated run finds the invoice it
 * already issued and the charge it already made.
 *
 * Runs as the operations role, across tenants, in the billing worker only.
 */

export type Db = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type Notice =
  | { kind: 'trial_ending'; to: string; daysLeft: number }
  | { kind: 'read_only'; to: string; reason: 'trial_ended' | 'payment_failed' }
  | { kind: 'payment_failed'; to: string; retryAt: Date | null }

export type RunOptions = {
  now: Date
  /** dry_run computes and records periods but never calls accounting or payments. */
  mode: 'dry_run' | 'live'
  /** A computed invoice above this net amount is held for an operator. */
  maxInvoiceCents: number
  /** Days between an invoice going out and the amount being collected (SEPA pre-notification). */
  collectAfterDays: number
  notify: (notice: Notice) => Promise<void>
  log: (message: string, data?: Record<string, unknown>) => void
}

const DAY = 86_400_000

// ── 0. Prices ──────────────────────────────────────────────────────────────

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
    }
    await db.query(`update plan_price_sync set checked_at = now(), last_error = null`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.query(`update plan_price_sync set last_error = $1`, [message])
    options.log('billing: could not read prices from accounting', { error: message })
  }
}

// ── 1. Closing a month ─────────────────────────────────────────────────────

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
  await db.query(
    `update billing_account
        set plan = next_plan, next_plan = null, plan_from = date_trunc('month', $1::timestamptz)::date,
            updated_at = now()
      where next_plan is not null`,
    [options.now],
  )
  options.log('billing: month closed', { month, periods: created })
  return created
}

// ── 2. Invoicing ───────────────────────────────────────────────────────────

export async function invoicePeriods(db: Db, adapters: BillingAdapters, options: RunOptions) {
  const { rows } = await db.query(
    `select p.*, b.customer_type, b.company_name, b.street, b.postal_code, b.city, b.country,
            b.vat_id, b.billing_email, b.invoicing_customer_ref, t.name as tenant_name
       from billing_period p
       join billing_account b on b.tenant_id = p.tenant_id
       left join tenant t on t.id = p.tenant_id
      where p.status = 'computed'
      order by p.month, p.created_at`,
  )

  for (const period of rows) {
    if (options.mode === 'dry_run') {
      options.log('billing: would invoice', { ref: period.invoice_ref, netCents: period.net_cents })
      continue
    }
    try {
      const customerRef = await adapters.invoicing.upsertCustomer({
        tenantId: period.tenant_id,
        customerRef: period.invoicing_customer_ref,
        customerType: period.customer_type,
        name: period.company_name ?? period.tenant_name ?? period.billing_email,
        email: period.billing_email,
        street: period.street,
        postalCode: period.postal_code,
        city: period.city,
        country: period.country,
        vatId: period.vat_id,
      })
      await db.query(
        `update billing_account set invoicing_customer_ref = $2, updated_at = now() where tenant_id = $1`,
        [period.tenant_id, customerRef],
      )

      const collectedAfter = new Date(options.now.getTime() + options.collectAfterDays * DAY)
      const invoice =
        (await adapters.invoicing.findInvoice(period.invoice_ref)) ??
        (await adapters.invoicing.issueInvoice({
          customerRef,
          ref: period.invoice_ref,
          lines: [
            {
              description: `GoodWorkshop ${period.plan} ${String(period.month).slice(0, 7)}`,
              quantity: Number(period.quantity),
              unitNetCents: period.unit_net_cents,
              plan: period.plan,
            },
          ],
          tax: {
            kind: period.tax_kind,
            country: period.tax_country,
            rate: period.tax_rate === null ? undefined : Number(period.tax_rate),
          } as never,
          collectedAfter,
        }))

      const problem = implausible(period, invoice)
      if (problem) {
        await db.query(
          `update billing_period set status = 'held', hold_reason = 'invoice_mismatch', last_error = $2,
                  invoice_id = $3, invoice_number = $4, updated_at = now()
            where id = $1 and status = 'computed'`,
          [period.id, problem, invoice.id, invoice.number],
        )
        options.log('billing: invoice held', { ref: period.invoice_ref, problem })
        continue
      }

      await db.query(
        `update billing_period
            set status = 'invoiced', invoice_id = $2, invoice_number = $3, invoice_url = $4,
                gross_cents = $5, invoiced_at = $6, charge_after = $7, updated_at = now()
          where id = $1 and status = 'computed'`,
        [
          period.id,
          invoice.id,
          invoice.number,
          invoice.url,
          invoice.grossCents,
          options.now,
          collectedAfter,
        ],
      )
    } catch (error) {
      await db.query(
        `update billing_period set last_error = $2, updated_at = now() where id = $1`,
        [period.id, String(error instanceof Error ? error.message : error)],
      )
      options.log('billing: invoicing failed, will retry', { ref: period.invoice_ref })
    }
  }
}

/** What the accounting system returned, checked against what was billed. */
export function implausible(
  period: { net_cents: number; tax_kind: string; tax_rate: string | number | null },
  invoice: IssuedInvoice,
): string | null {
  if (invoice.netCents !== period.net_cents) {
    return `net ${invoice.netCents} instead of ${period.net_cents}`
  }
  const rate = period.tax_kind === 'domestic' ? Number(period.tax_rate) : 0
  const expected = Math.round(period.net_cents * rate)
  if (Math.abs(invoice.taxCents - expected) > 1)
    return `tax ${invoice.taxCents} instead of ${expected}`
  if (invoice.grossCents !== invoice.netCents + invoice.taxCents) return 'gross is not net plus tax'
  return null
}

// ── 3. Collecting ──────────────────────────────────────────────────────────

export async function chargeDue(db: Db, adapters: BillingAdapters, options: RunOptions) {
  const { rows } = await db.query(
    `select p.*, b.payment_customer_ref, b.billing_email
       from billing_period p
       join billing_account b on b.tenant_id = p.tenant_id
      where p.status in ('invoiced', 'failed')
        and p.charge_after is not null and p.charge_after <= $1
        and b.payment_method_ready and b.payment_customer_ref is not null`,
    [options.now],
  )

  for (const period of rows) {
    if (options.mode === 'dry_run') {
      options.log('billing: would charge', {
        ref: period.invoice_ref,
        grossCents: period.gross_cents,
      })
      continue
    }
    const claimed = await db.query(
      `update billing_period set status = 'charging', updated_at = now()
        where id = $1 and status = $2 returning id`,
      [period.id, period.status],
    )
    if (!claimed.rowCount) continue

    try {
      const result = await adapters.payments.charge({
        customerRef: period.payment_customer_ref,
        amountCents: period.gross_cents,
        // One key per attempt: a retry after a decline is a new charge, a repeat
        // of the same attempt is not.
        idempotencyKey: `${period.invoice_ref}-${period.attempts + 1}`,
        description: `GoodWorkshop ${period.invoice_number ?? period.invoice_ref}`,
      })
      await db.query(`update billing_period set payment_ref = $2 where id = $1`, [
        period.id,
        result.paymentRef,
      ])
      if (result.status === 'succeeded') {
        await markPaid(db, adapters, { ...period, payment_ref: result.paymentRef }, options)
      } else if (result.status === 'failed') {
        await markFailed(db, period, result.reason ?? 'declined', options)
      }
      // processing: SEPA takes days; the webhook finishes it.
    } catch (error) {
      await db.query(
        `update billing_period set status = $2, last_error = $3, updated_at = now() where id = $1`,
        [period.id, period.status, String(error instanceof Error ? error.message : error)],
      )
    }
  }
}

async function markPaid(
  db: Db,
  adapters: BillingAdapters,
  period: { id: string; invoice_id: string; gross_cents: number; payment_ref: string },
  options: RunOptions,
) {
  const updated = await db.query(
    `update billing_period set status = 'paid', paid_at = $2, last_error = null, updated_at = now()
      where id = $1 and status = 'charging' returning id`,
    [period.id, options.now],
  )
  if (!updated.rowCount) return
  await adapters.invoicing.recordPayment({
    invoiceId: period.invoice_id,
    amountCents: period.gross_cents,
    paidAt: options.now,
    paymentRef: period.payment_ref,
  })
}

async function markFailed(
  db: Db,
  period: { id: string; tenant_id: string; attempts: number; billing_email: string },
  reason: string,
  options: RunOptions,
) {
  const attempts = period.attempts + 1
  const retryAt = nextAttempt(attempts, options.now)
  const updated = await db.query(
    `update billing_period set status = 'failed', attempts = $2, charge_after = $3, last_error = $4,
            updated_at = now()
      where id = $1 and status = 'charging' returning id`,
    [period.id, attempts, retryAt, reason],
  )
  if (!updated.rowCount) return

  await options.notify({ kind: 'payment_failed', to: period.billing_email, retryAt })
  if (!retryAt) {
    const locked = await db.query(
      `update tenant_lifecycle set state = 'read_only', updated_at = now()
        where tenant_id = $1 and state <> 'read_only' returning tenant_id`,
      [period.tenant_id],
    )
    if (locked.rowCount) {
      await options.notify({
        kind: 'read_only',
        to: period.billing_email,
        reason: 'payment_failed',
      })
    }
  }
}

// ── 4. What the payment provider reported ──────────────────────────────────

export async function processPaymentEvents(db: Db, adapters: BillingAdapters, options: RunOptions) {
  const { rows } = await db.query(
    `select id, payload from payment_event where processed_at is null order by received_at`,
  )

  for (const { id, payload } of rows) {
    const event = payload as PaymentEvent
    if (event.type === 'payment_succeeded' || event.type === 'payment_failed') {
      const { rows: periods } = await db.query(
        `select p.*, b.billing_email from billing_period p
           join billing_account b on b.tenant_id = p.tenant_id
          where p.payment_ref = $1 and p.status = 'charging'`,
        [event.paymentRef],
      )
      for (const period of periods) {
        if (event.type === 'payment_succeeded') await markPaid(db, adapters, period, options)
        else await markFailed(db, period, event.reason, options)
      }
    } else if (event.type === 'payment_method_ready') {
      await db.query(
        `update billing_account set payment_method_ready = true, payment_customer_ref = $2,
                updated_at = now()
          where tenant_id = $1`,
        [event.tenantId, event.customerRef],
      )
      if (event.country) {
        await db.query(
          `insert into tax_evidence (tenant_id, kind, country) values ($1, 'payment_method', $2)`,
          [event.tenantId, event.country],
        )
      }
      // A tenant locked only because its trial ran out without a payment method
      // is unlocked by adding one. One locked for failed payments stays locked
      // until they are settled.
      await db.query(
        `update tenant_lifecycle set state = 'active', updated_at = now()
          where tenant_id = $1 and state = 'read_only'
            and not exists (select 1 from billing_period
                             where tenant_id = $1 and status = 'failed' and charge_after is null)`,
        [event.tenantId],
      )
    }
    await db.query(`update payment_event set processed_at = now() where id = $1`, [id])
  }
}

// ── 5. Trials ──────────────────────────────────────────────────────────────

/** Reminder days before the trial ends, as the key they are remembered by. */
const REMINDERS = [
  { key: 'trial_4d', days: 4 },
  { key: 'trial_1d', days: 1 },
] as const

export async function trialTransitions(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select l.tenant_id, l.trial_ends_at, b.payment_method_ready, b.billing_email, b.reminders_sent
       from tenant_lifecycle l join billing_account b on b.tenant_id = l.tenant_id
      where l.state = 'trial' and l.trial_ends_at is not null`,
  )

  for (const tenant of rows) {
    const left = tenant.trial_ends_at.getTime() - options.now.getTime()

    if (left <= 0) {
      const next = tenant.payment_method_ready ? 'active' : 'read_only'
      const moved = await db.query(
        `update tenant_lifecycle set state = $2, updated_at = now()
          where tenant_id = $1 and state = 'trial' returning tenant_id`,
        [tenant.tenant_id, next],
      )
      if (moved.rowCount && next === 'read_only') {
        await options.notify({ kind: 'read_only', to: tenant.billing_email, reason: 'trial_ended' })
      }
      continue
    }

    if (tenant.payment_method_ready) continue
    for (const reminder of REMINDERS) {
      if (left > reminder.days * DAY || tenant.reminders_sent.includes(reminder.key)) continue
      const marked = await db.query(
        `update billing_account set reminders_sent = array_append(reminders_sent, $2)
          where tenant_id = $1 and not ($2 = any(reminders_sent)) returning tenant_id`,
        [tenant.tenant_id, reminder.key],
      )
      if (marked.rowCount) {
        await options.notify({
          kind: 'trial_ending',
          to: tenant.billing_email,
          daysLeft: Math.max(1, Math.ceil(left / DAY)),
        })
      }
      break
    }
  }
}

// ── 6. VAT numbers VIES could not answer for ───────────────────────────────

export async function recheckPendingVat(
  db: Db,
  check: (vatId: string) => Promise<VatCheck>,
  options: RunOptions,
) {
  const { rows } = await db.query(
    `select tenant_id, vat_id from billing_account where vat_status = 'pending' and vat_id is not null`,
  )
  for (const account of rows) {
    const result = await check(account.vat_id)
    await db.query(
      `insert into vat_check (tenant_id, vat_id, result, name, address, consultation_number, error, checked_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        account.tenant_id,
        account.vat_id,
        result.status,
        'name' in result ? result.name : null,
        'address' in result ? result.address : null,
        'consultationNumber' in result ? result.consultationNumber : null,
        'error' in result ? result.error : null,
        result.checkedAt,
      ],
    )
    if (result.status !== 'unavailable') {
      await db.query(
        `update billing_account set vat_status = $2, updated_at = now() where tenant_id = $1`,
        [account.tenant_id, result.status],
      )
      // A period held only because the number was pending can be billed now.
      await db.query(
        `delete from billing_period where tenant_id = $1 and status = 'held' and hold_reason = 'vat_pending'`,
        [account.tenant_id],
      )
    }
  }
  if (rows.length) options.log('billing: VAT numbers rechecked', { count: rows.length })
}

// ── 7. Workspaces whose deletion grace period is over ─────────────────────

/**
 * Deletes a workspace for good: its content, its members, and every account
 * that belonged to no other workspace. The bookkeeping stays -- billing_account,
 * billing_period, vat_check and the usage tables have no foreign key to tenant
 * on purpose.
 *
 * Waits until the month the deletion was asked for has been closed, so that the
 * last, partial month is invoiced like every other one.
 */
export async function purgeDeletedTenants(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select l.tenant_id, l.deletion_requested_at
       from tenant_lifecycle l
      where l.state = 'deleting' and l.delete_after <= $1`,
    [options.now],
  )

  for (const tenant of rows) {
    const requestedMonth = `${viennaDay(tenant.deletion_requested_at).slice(0, 7)}-01`
    const closed = await db.query(
      `select 1 from billing_period where tenant_id = $1 and month = $2`,
      [tenant.tenant_id, requestedMonth],
    )
    const stillInTrial = await db.query(
      `select 1 from tenant_lifecycle
        where tenant_id = $1 and (trial_ends_at is null or trial_ends_at > deletion_requested_at)`,
      [tenant.tenant_id],
    )
    if (!closed.rowCount && !stillInTrial.rowCount) continue

    const { rows: identities } = await db.query(
      `select identity_id from member where tenant_id = $1`,
      [tenant.tenant_id],
    )
    await db.query('begin')
    try {
      // Revisions carry no foreign key (see the schema); everything else goes
      // with the tenant row by cascade.
      await db.query(`delete from module_revision where tenant_id = $1`, [tenant.tenant_id])
      await db.query(`delete from tenant where id = $1`, [tenant.tenant_id])
      await db.query(
        `delete from identity i
          where i.id = any($1::uuid[])
            and not exists (select 1 from member m where m.identity_id = i.id)`,
        [identities.map((row) => row.identity_id)],
      )
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    }
    options.log('billing: workspace deleted', { tenantId: tenant.tenant_id })
  }
}

// ── All of it ──────────────────────────────────────────────────────────────

export async function runBilling(
  db: Db,
  adapters: BillingAdapters | null,
  check: (vatId: string) => Promise<VatCheck>,
  options: RunOptions,
) {
  await recheckPendingVat(db, check, options)
  await trialTransitions(db, options)
  // Before closing a month: that month is billed at a price this step may have
  // recorded, and the freshness of the answer decides whether we still sell.
  if (adapters) await syncPlanPrices(db, adapters, options)
  await closeMonth(db, previousMonth(options.now), options)
  await purgeDeletedTenants(db, options)
  if (!adapters) {
    options.log('billing: no adapters in this build, invoicing and payments are off')
    return
  }
  await processPaymentEvents(db, adapters, options)
  await invoicePeriods(db, adapters, options)
  await chargeDue(db, adapters, options)
}
