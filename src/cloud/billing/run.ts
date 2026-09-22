import { DELETION_GRACE_DAYS, PLANS, PLAN_KEYS, isPlanKey, type PlanKey } from './plans'
import { nextChangeMonth, priceAt, type PlanPrice } from './prices'
import type { BillingAdapters, IssuedInvoice, PaymentEvent } from './ports'
import {
  blockAfter,
  DUNNING_GRACE_DAYS,
  invoiceRef,
  memberMonths,
  invoiceLine,
  invoiceLocaleOf,
  monthDays,
  netCents,
  nextAttempt,
  previousMonth,
  viennaDay,
  type Interval,
} from './usage'
import { taxTreatment, type VatStatus } from '@/cloud/tax/treatment'
import { isLocale, type Locale } from '@/i18n/config'
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

/**
 * What the billing run tells a customer -- in the language they registered in,
 * which the billing account remembers.
 */
export type Notice = { to: string; locale: Locale } & (
  | { kind: 'trial_ending'; daysLeft: number }
  | { kind: 'read_only'; reason: 'trial_ended' | 'payment_failed' }
  | { kind: 'payment_failed'; retryAt: Date | null }
  | { kind: 'contract_ended'; exportUntil: Date }
  | { kind: 'dunning'; blockOn: Date }
  | { kind: 'payment_blocked' }
  | { kind: 'unblocked' }
  | { kind: 'price_change'; plan: PlanKey; netCents: number; from: string }
  | { kind: 'terms_change'; document: string; version: string; from: string }
)

export type RunOptions = {
  now: Date
  /** dry_run computes and records periods but never calls accounting or payments. */
  mode: 'dry_run' | 'live'
  /** A computed invoice above this net amount is held for an operator. */
  maxInvoiceCents: number
  /** Days between an invoice going out and the amount being collected. */
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

/**
 * A new version of a legal text, announced to everybody it binds.
 *
 * Started by an operator rather than by a deploy: publishing a text and putting
 * it into force are two decisions, and the second one carries a date the
 * customer can object until (AGB § 14.3 and § 14.4).
 */
/**
 * Announcements an operator has made and the run has not yet sent.
 *
 * The decision is a row in `legal_announcement`; this is the step that turns it
 * into mail. Marked as done with what it actually told, so an interrupted run
 * picks up the rest rather than starting over -- `legal_acknowledgement` has a
 * unique key per workspace and version, which is what makes that safe.
 */
export async function pendingAnnouncements(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select id, document, version, effective_from from legal_announcement
      where completed_at is null order by created_at`,
  )
  for (const announcement of rows) {
    const told = await announceTermsChange(
      db,
      announcement.document,
      announcement.version,
      viennaDay(announcement.effective_from),
      options,
    )
    await db.query(`update legal_announcement set completed_at = now(), told = $2 where id = $1`, [
      announcement.id,
      told,
    ])
    options.log('billing: terms change announced', {
      document: announcement.document,
      version: announcement.version,
      told,
    })
  }
}

export async function announceTermsChange(
  db: Db,
  document: string,
  version: string,
  effectiveFrom: string,
  options: RunOptions,
): Promise<number> {
  const { rows } = await db.query(
    `select b.tenant_id, b.billing_email, b.locale
       from billing_account b
       join tenant_lifecycle l on l.tenant_id = b.tenant_id
      where l.state not in ('deleting')
        and not exists (select 1 from legal_acknowledgement a
                         where a.tenant_id = b.tenant_id and a.document = $1 and a.version = $2)`,
    [document, version],
  )

  let told = 0
  for (const tenant of rows) {
    const marked = await db.query(
      `insert into legal_acknowledgement (tenant_id, document, version, effective_from)
       values ($1, $2, $3, $4) on conflict do nothing returning tenant_id`,
      [tenant.tenant_id, document, version, effectiveFrom],
    )
    if (!marked.rowCount) continue
    told += 1
    await announce(options, {
      kind: 'terms_change',
      to: tenant.billing_email,
      locale: localeOf(tenant.locale),
      document,
      version,
      from: effectiveFrom,
    })
  }
  return told
}

/**
 * How long rows that have stopped being useful are kept.
 *
 * Storage limitation (Art. 5(1)(e) GDPR) is an obligation, not a tidiness
 * preference, and every one of these carries something about a person: an
 * address and an IP on a sign-in link, an IP and a user agent on a session, a
 * trail of who did what. The numbers are here rather than in the SQL so that
 * the privacy policy and the code can be checked against each other -- and a
 * test does exactly that.
 */
export const RETENTION_DAYS = {
  /** Sign-in links and invitations, useless the moment they expire. */
  emailToken: 30,
  /** Sessions that can no longer be used, ours and a guest's. */
  session: 30,
  /** The audit trail: long enough to answer "who did that", not longer. */
  auditEvent: 365,
} as const

/**
 * Deletes what has stopped being useful.
 *
 * `docs/data-protection.md` used to say, first and in bold, that GoodWorkshop
 * has no retention job and that an operator therefore has to schedule one. That
 * is a fair answer for a self-hosted installation, where the operator is the
 * controller. In the cloud WE are the processor and the sentence was simply a
 * gap: expired rows were treated as invalid when read and kept for ever.
 *
 * Runs as the operations role, which is not scoped to a tenant -- these sweep
 * all of them, which is the point.
 */
export async function sweepExpired(db: Db, options: RunOptions) {
  if (options.mode === 'dry_run') {
    options.log('billing: dry run, nothing swept')
    return
  }

  const swept: Record<string, number> = {}
  const statements: [string, string, number][] = [
    ['email_token', `delete from email_token where expires_at < $1`, RETENTION_DAYS.emailToken],
    [
      'auth_session',
      `delete from auth_session where expires_at < $1 or revoked_at < $1`,
      RETENTION_DAYS.session,
    ],
    [
      'share_session',
      `delete from share_session where expires_at < $1 or revoked_at < $1`,
      RETENTION_DAYS.session,
    ],
    ['audit_event', `delete from audit_event where created_at < $1`, RETENTION_DAYS.auditEvent],
  ]

  for (const [table, statement, days] of statements) {
    const before = new Date(options.now.getTime() - days * DAY)
    const { rowCount } = await db.query(statement, [before])
    if (rowCount) swept[table] = rowCount
  }

  if (Object.keys(swept).length > 0) options.log('billing: swept expired rows', swept)
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

// ── 2. Invoicing ───────────────────────────────────────────────────────────

export async function invoicePeriods(db: Db, adapters: BillingAdapters, options: RunOptions) {
  const { rows } = await db.query(
    `select p.*, b.customer_type, b.company_name, b.street, b.postal_code, b.city, b.country,
            b.vat_id, b.billing_email, b.invoicing_customer_ref, b.locale, t.name as tenant_name
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
    const locale = invoiceLocaleOf(period.locale)
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
        locale,
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
              description: invoiceLine(PLANS[period.plan as PlanKey].unit, period.month, locale),
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
          locale,
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
    `select p.*, b.payment_customer_ref, b.billing_email, b.locale
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
      // processing: a card that needs a further step takes its time; the
      // webhook finishes it.
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
  period: {
    id: string
    tenant_id: string
    invoice_id: string
    gross_cents: number
    payment_ref: string
  },
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
  // Paying is what reopens a workspace, whether the money arrived on a retry or
  // through a webhook long after the block.
  await settleBlocked(db, period.tenant_id, options)
}

/**
 * Tells the customer, and never lets that get in the way of the books.
 *
 * A notice is a side effect; what has just been written is the truth. When the
 * mail fails -- a provider outage, a configuration the worker cannot reach --
 * the run has to carry on, or a tenant that should be locked stays open and a
 * failed charge looks like an invoice nobody ever tried to collect. Which is
 * exactly what happened: the worker could not send at all, the exception
 * unwound the handling around it, and the failure became invisible.
 */
/** What the account remembers, or German when it remembers nothing usable. */
function localeOf(value: string | null | undefined): Locale {
  return isLocale(value) ? value : 'de'
}

async function announce(options: RunOptions, notice: Notice): Promise<void> {
  try {
    await options.notify(notice)
  } catch (error) {
    options.log('billing: notice could not be sent', {
      kind: notice.kind,
      to: notice.to,
      error: String(error instanceof Error ? error.message : error),
    })
  }
}

async function markFailed(
  db: Db,
  period: {
    id: string
    tenant_id: string
    attempts: number
    billing_email: string
    locale: string
  },
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

  // Locking comes before telling. The lock is what protects the business; the
  // mail is a courtesy, and a courtesy must not decide whether the lock holds.
  const locked =
    !retryAt &&
    (
      await db.query(
        `update tenant_lifecycle set state = 'read_only', updated_at = now()
          where tenant_id = $1 and state <> 'read_only' returning tenant_id`,
        [period.tenant_id],
      )
    ).rowCount

  const locale = localeOf(period.locale)
  await announce(options, { kind: 'payment_failed', to: period.billing_email, locale, retryAt })
  if (locked) {
    await announce(options, {
      kind: 'read_only',
      to: period.billing_email,
      locale,
      reason: 'payment_failed',
    })
    // The reminder § 5.4 asks for before the access may be blocked, with the
    // date it would happen on. Recorded, because the next step waits for it.
    await db.query(
      `update tenant_lifecycle set dunned_at = $2, updated_at = now()
        where tenant_id = $1 and dunned_at is null`,
      [period.tenant_id, options.now],
    )
    await announce(options, {
      kind: 'dunning',
      to: period.billing_email,
      locale,
      blockOn: blockAfter(options.now),
    })
  }
}

/**
 * Step three: the reminder went unanswered, so the product closes.
 *
 * Automatic in both directions. Nobody has to decide to block a workspace whose
 * invoice is two weeks overdue, and nobody has to decide to reopen one that has
 * paid -- `settleBlocked` below does that from the payment itself. What an
 * operator can still do is put grace in the way, and the ladder then steps over
 * this tenant until the date passes.
 */
export async function dunningTransitions(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select l.tenant_id, b.billing_email, b.locale
       from tenant_lifecycle l join billing_account b on b.tenant_id = l.tenant_id
      where l.state = 'read_only' and l.dunned_at is not null
        and l.dunned_at <= $1::timestamptz - make_interval(days => $2)
        and (l.grace_until is null or l.grace_until <= $1::timestamptz)
        and exists (select 1 from billing_period p
                     where p.tenant_id = l.tenant_id and p.status = 'failed'
                       and p.charge_after is null)`,
    [options.now, DUNNING_GRACE_DAYS],
  )

  for (const tenant of rows) {
    const moved = await db.query(
      `update tenant_lifecycle set state = 'payment_blocked', updated_at = now()
        where tenant_id = $1 and state = 'read_only' returning tenant_id`,
      [tenant.tenant_id],
    )
    if (!moved.rowCount) continue
    await announce(options, {
      kind: 'payment_blocked',
      to: tenant.billing_email,
      locale: localeOf(tenant.locale),
    })
  }
}

/**
 * The way back, and it is the payment itself.
 *
 * Called wherever a period stops being owed -- a late charge that succeeds, a
 * webhook that arrives after the block. There is deliberately no operator
 * button for this one: what settles a debt is the money, not a decision.
 */
async function settleBlocked(db: Db, tenantId: string, options: RunOptions) {
  const { rows } = await db.query(
    `update tenant_lifecycle l
        set state = 'active', dunned_at = null, grace_until = null, updated_at = now()
      from billing_account b
      where b.tenant_id = l.tenant_id and l.tenant_id = $1
        and l.state in ('read_only', 'payment_blocked')
        and b.payment_method_ready
        and not exists (select 1 from billing_period p
                         where p.tenant_id = l.tenant_id and p.status = 'failed')
      returning b.billing_email, b.locale`,
    [tenantId],
  )
  const row = rows[0]
  if (!row) return
  await announce(options, {
    kind: 'unblocked',
    to: row.billing_email,
    locale: localeOf(row.locale),
  })
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
        `select p.*, b.billing_email, b.locale from billing_period p
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
      // until they are settled -- which settleBlocked is the single judge of.
      await db.query(
        `update tenant_lifecycle set state = 'active', dunned_at = null, updated_at = now()
          where tenant_id = $1 and state = 'read_only'
            and not exists (select 1 from billing_period
                             where tenant_id = $1 and status = 'failed')`,
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

/**
 * Contracts that ran out at the end of last month (AGB § 6.2).
 *
 * The notice period is over, so the workspace becomes what a workspace becomes
 * when its customer leaves: read-only, exportable, and deleted after the grace
 * period. That is the deletion path, reused deliberately -- one way from "no
 * longer a customer" to "data gone", with the export window in it, and a purge
 * that waits for the last month to be invoiced.
 */
export async function contractTransitions(db: Db, options: RunOptions) {
  const today = viennaDay(options.now)
  const { rows } = await db.query(
    `select l.tenant_id, b.billing_email, b.locale
       from tenant_lifecycle l join billing_account b on b.tenant_id = l.tenant_id
      where l.contract_ends_on is not null and l.contract_ends_on < $1::date
        and l.state <> 'deleting'`,
    [today],
  )

  for (const tenant of rows) {
    const { rows: scheduled } = await db.query(
      `select app.cloud_schedule_tenant_deletion($1, $2) as delete_after`,
      [tenant.tenant_id, DELETION_GRACE_DAYS],
    )
    const until = scheduled[0]?.delete_after
    if (!until) continue
    await announce(options, {
      kind: 'contract_ended',
      to: tenant.billing_email,
      locale: localeOf(tenant.locale),
      exportUntil: until,
    })
  }
}

export async function trialTransitions(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select l.tenant_id, l.trial_ends_at, b.payment_method_ready, b.billing_email, b.locale,
            b.reminders_sent
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
        await announce(options, {
          kind: 'read_only',
          to: tenant.billing_email,
          locale: localeOf(tenant.locale),
          reason: 'trial_ended',
        })
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
        await announce(options, {
          kind: 'trial_ending',
          to: tenant.billing_email,
          locale: localeOf(tenant.locale),
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

// ── The invoice document ───────────────────────────────────────────────────

/**
 * Fetches the invoice as it was sent and keeps it, so a customer can download
 * its own later without an account in the accounting system.
 *
 * Separate from invoicing on purpose: an invoice that is issued and sent but
 * whose PDF could not be fetched is not a failed invoice. The next run picks it
 * up.
 */
export async function storeInvoiceDocuments(
  db: Db,
  adapters: BillingAdapters,
  options: RunOptions,
): Promise<number> {
  if (options.mode === 'dry_run') return 0

  const { rows } = await db.query(
    `select p.tenant_id, p.month, p.invoice_id, p.invoice_number
       from billing_period p
       left join invoice_document d on d.tenant_id = p.tenant_id and d.month = p.month
      where p.invoice_id is not null and d.tenant_id is null
      order by p.month
      limit 50`,
  )

  let stored = 0
  for (const period of rows) {
    try {
      const document = await adapters.invoicing.invoiceDocument(period.invoice_id)
      if (!document) continue
      await db.query(
        `insert into invoice_document (tenant_id, month, filename, content, byte_size)
         values ($1, $2, $3, $4, $5)
         on conflict (tenant_id, month) do nothing`,
        [
          period.tenant_id,
          period.month,
          document.filename,
          Buffer.from(document.bytes),
          document.bytes.byteLength,
        ],
      )
      stored += 1
    } catch (error) {
      options.log('billing: could not fetch the invoice document', {
        invoice: period.invoice_number,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return stored
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
  await contractTransitions(db, options)
  await dunningTransitions(db, options)
  await pendingAnnouncements(db, options)
  // Before closing a month: that month is billed at a price this step may have
  // recorded, and the freshness of the answer decides whether we still sell.
  if (adapters) await syncPlanPrices(db, adapters, options)
  await closeMonth(db, previousMonth(options.now), options)
  await purgeDeletedTenants(db, options)
  await sweepExpired(db, options)
  if (!adapters) {
    options.log('billing: no adapters in this build, invoicing and payments are off')
    return
  }
  await processPaymentEvents(db, adapters, options)
  await invoicePeriods(db, adapters, options)
  await storeInvoiceDocuments(db, adapters, options)
  await chargeDue(db, adapters, options)
}
