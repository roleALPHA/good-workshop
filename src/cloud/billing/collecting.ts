import type { BillingAdapters, PaymentEvent } from './ports'
import { blockAfter, DUNNING_GRACE_DAYS, nextAttempt } from './usage'
import { announce, localeOf, type Db, type RunOptions } from './context'

/**
 * Collecting the money, and what happens when it does not arrive.
 *
 * Every state here is one the customer can be told about and one an operator can
 * see: charged, failed, in dunning, blocked, settled. The transitions are
 * separate steps rather than one, because a run interrupted between two of them
 * has to be able to pick up at the next -- and because "we tried and it failed"
 * is a different fact from "the grace period is over".
 *
 * A notice never fails the step. See `announce` in ./context.ts for what that
 * cost us before it was true.
 */

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
