import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fakeAdapters } from './adapters/fake'
import { billingFixture, type BillingSetup } from './fixture'
import { DUNNING_GRACE_DAYS } from './usage'
import {
  chargeDue,
  closeMonth,
  storeInvoiceDocuments,
  invoicePeriods,
  processPaymentEvents,
  announceTermsChange,
  pendingAnnouncements,
  recheckPendingVat,
  dunningTransitions,
  runBilling,
  sweepExpired,
  syncPlanPrices,
  trialTransitions,
  type Notice,
  type RunOptions,
} from './run'
import type { BillingAdapters } from './ports'

/**
 * The billing run against a cloud database, with in-memory accounting and
 * payments: what gets counted, what gets invoiced, what gets collected -- and
 * that none of it happens twice.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
// The same fixture the invoice captures use, so a person reviewing an
// invoice reviews the tenant these tests make their assertions about.
const fixture = billingFixture(ops)
const { operators, announcements } = fixture
const { tenant, interval, workshopCreated } = fixture
const MARCH = '2026-03-01'
const APRIL_2 = new Date('2026-04-02T08:00:00Z')

let notices: Notice[] = []
const options = (overrides: Partial<RunOptions> = {}): RunOptions => ({
  now: APRIL_2,
  mode: 'live',
  maxInvoiceCents: 100_000,
  collectAfterDays: 2,
  notify: async (notice) => {
    notices.push(notice)
  },
  log: () => {},
  ...overrides,
})

const period = async (tenantId: string) =>
  (
    await ops.query('select * from billing_period where tenant_id = $1 and month = $2', [
      tenantId,
      MARCH,
    ])
  ).rows[0]

beforeAll(async () => {
  await ops.connect()
  // Periods of tenants from earlier runs of this file would be picked up by the
  // steps below, which work across all tenants -- as they should.
  await ops.query(
    `delete from billing_period where status in ('computed', 'invoiced', 'failed', 'charging')`,
  )
})

beforeEach(() => {
  notices = []
})

afterAll(async () => {
  await fixture.cleanup()
  await ops.end()
})

describe('recording usage', () => {
  it('opens and closes a member’s interval as the membership is switched on and off', async () => {
    const id = await tenant()
    const identityId = randomUUID()
    const memberId = randomUUID()
    await ops.query(`insert into identity (id, email) values ($1, $2)`, [
      identityId,
      `u-${identityId}@example.test`,
    ])
    try {
      await ops.query(
        `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
        [memberId, id, identityId],
      )
      await ops.query(`update member set status = 'disabled' where id = $1`, [memberId])
      await ops.query(`update member set status = 'active' where id = $1`, [memberId])
      await ops.query(`update member set role = 'admin' where id = $1`, [memberId])

      const { rows } = await ops.query(
        `select active_to is null as open from usage_member_interval where member_id = $1 order by active_from`,
        [memberId],
      )
      expect(rows.map((r) => r.open)).toEqual([false, true])

      await ops.query(`delete from member where id = $1`, [memberId])
      const after = await ops.query(
        `select count(*)::int as open from usage_member_interval where member_id = $1 and active_to is null`,
        [memberId],
      )
      expect(after.rows[0].open).toBe(0)
    } finally {
      await ops.query('delete from identity where id = $1', [identityId])
    }
  })

  it('records every workshop created, and whether it was during the trial', async () => {
    const inTrial = await tenant({ state: 'trial', trialEndsAt: '2099-01-01T00:00:00Z' })
    const paying = await tenant()
    const owner = async (tenantId: string) => {
      const identityId = randomUUID()
      const memberId = randomUUID()
      await ops.query(`insert into identity (id, email) values ($1, $2)`, [
        identityId,
        `o-${identityId}@example.test`,
      ])
      await ops.query(
        `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'admin', 'active')`,
        [memberId, tenantId, identityId],
      )
      return memberId
    }
    for (const tenantId of [inTrial, paying]) {
      await ops.query(
        `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Gezählt', $3, 'a0')`,
        [uuidv7(), tenantId, await owner(tenantId)],
      )
    }
    const { rows } = await ops.query(
      `select tenant_id, in_trial from usage_workshop_created where tenant_id = any($1::uuid[])`,
      [[inTrial, paying]],
    )
    expect(Object.fromEntries(rows.map((r) => [r.tenant_id, r.in_trial]))).toEqual({
      [inTrial]: true,
      [paying]: false,
    })
  })
})

describe('prices from the accounting system', () => {
  beforeEach(async () => {
    await ops.query(`delete from plan_price where source = 'accounting'`)
  })

  it('records a change from the first month that is six weeks away', async () => {
    // Not merely "not this month": AGB § 4.7 promises six weeks, and on the
    // 18th the first of the coming month is twelve days. The date itself
    // carries the promise now, so nobody has to remember it.
    const fake = fakeAdapters()
    fake.prices.set('per_user', 900)
    await syncPlanPrices(ops, fake.adapters, options({ now: new Date('2026-09-18T10:00:00Z') }))

    const { rows } = await ops.query(
      `select net_cents, to_char(effective_from, 'YYYY-MM-DD') as from_day
         from plan_price where plan = 'per_user' and source = 'accounting'`,
    )
    expect(rows).toEqual([{ net_cents: 900, from_day: '2026-11-01' }])
  })

  it('bills a month at the price that was in force when it began', async () => {
    const id = await tenant({ plan: 'per_user' })
    await interval(id, '2026-01-01T00:00:00Z', null)
    await ops.query(
      `insert into plan_price (plan, net_cents, effective_from, source)
       values ('per_user', 700, '2026-04-01', 'accounting')`,
    )

    await closeMonth(ops, MARCH, options())

    // April's price is already recorded when March is invoiced in April.
    const { rows } = await ops.query(
      'select unit_net_cents from billing_period where tenant_id = $1',
      [id],
    )
    expect(rows[0]).toMatchObject({ unit_net_cents: 500 })
  })

  it('remembers when accounting last answered, and what went wrong', async () => {
    const broken = fakeAdapters()
    broken.adapters.invoicing.planPrice = async () => {
      throw new Error('accounting is down')
    }
    await syncPlanPrices(ops, broken.adapters, options())

    const { rows } = await ops.query('select checked_at, last_error from plan_price_sync')
    expect(rows[0].last_error).toContain('accounting is down')

    await syncPlanPrices(ops, fakeAdapters().adapters, options())
    const after = await ops.query('select checked_at, last_error from plan_price_sync')
    expect(after.rows[0].last_error).toBeNull()
    expect(after.rows[0].checked_at).not.toBeNull()
  })
})

describe('closing a month', () => {
  it('bills members by the day, with Austrian VAT, once', async () => {
    const id = await tenant({ plan: 'per_user' })
    await interval(id, '2026-01-01T00:00:00Z', null)
    await interval(id, '2026-03-16T09:00:00Z', null)

    await closeMonth(ops, MARCH, options())
    await closeMonth(ops, MARCH, options())

    const rows = (await ops.query('select * from billing_period where tenant_id = $1', [id])).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      plan: 'per_user',
      quantity: '1.52',
      net_cents: 760,
      tax_kind: 'domestic',
      tax_country: 'AT',
      tax_rate: '0.2000',
      status: 'computed',
    })
    expect(rows[0].invoice_ref).toMatch(/^GW-[0-9A-F]{12}-2026-03$/)
  })

  it('counts workshops after the trial only', async () => {
    const id = await tenant({ plan: 'per_workshop', trialEndsAt: '2026-03-10T00:00:00Z' })
    await workshopCreated(id, '2026-03-05T10:00:00Z', true)
    await workshopCreated(id, '2026-03-12T10:00:00Z')
    await workshopCreated(id, '2026-03-20T10:00:00Z')
    await workshopCreated(id, '2026-04-01T10:00:00Z')

    await closeMonth(ops, MARCH, options())
    expect(await period(id)).toMatchObject({ quantity: '2.00', net_cents: 200, status: 'computed' })
  })

  it('bills nothing for a month still inside the trial', async () => {
    const id = await tenant({ state: 'trial', trialEndsAt: '2026-04-10T00:00:00Z' })
    await interval(id, '2026-01-01T00:00:00Z', null)
    await closeMonth(ops, MARCH, options())
    expect(await period(id)).toBeUndefined()
  })

  it.each([
    [
      'a pending VAT number',
      { country: 'DE', vatId: 'DE123456789', vatStatus: 'pending' },
      'held',
      'vat_pending',
    ],
    ['an amount above the limit', {}, 'held', 'over_limit'],
  ])('holds %s for an operator', async (_, setup, status, reason) => {
    const id = await tenant(setup)
    await interval(id, '2026-01-01T00:00:00Z', null)
    await closeMonth(
      ops,
      MARCH,
      options({ maxInvoiceCents: reason === 'over_limit' ? 50 : 100_000 }),
    )
    expect(await period(id)).toMatchObject({ status, hold_reason: reason })
  })

  it('bills a German business with a valid number without VAT, and voids an empty month', async () => {
    const reverse = await tenant({ country: 'DE', vatId: 'DE123456789', vatStatus: 'valid' })
    await interval(reverse, '2026-01-01T00:00:00Z', null)
    const empty = await tenant()
    await closeMonth(ops, MARCH, options())
    expect(await period(reverse)).toMatchObject({
      tax_kind: 'reverse_charge',
      tax_country: 'DE',
      tax_rate: null,
    })
    expect(await period(empty)).toMatchObject({ status: 'void', net_cents: 0 })
  })
})

describe('invoicing and collecting', () => {
  async function computed(setup: BillingSetup = {}) {
    const id = await tenant(setup)
    await interval(id, '2026-01-01T00:00:00Z', null)
    await closeMonth(ops, MARCH, options())
    return id
  }

  /**
   * A tenant whose invoice has failed for good: three attempts gone, read-only,
   * and the reminder sent. The state the dunning ladder starts its last step in.
   */
  async function failedForGood() {
    const id = await computed({ paymentReady: true })
    const fake = fakeAdapters({ chargeOutcome: 'failed' })
    await invoicePeriods(ops, fake.adapters, options())

    let now = new Date(APRIL_2.getTime() + 3 * 86_400_000)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await chargeDue(ops, fake.adapters, options({ now }))
      const current = await period(id)
      if (current.charge_after) now = new Date(current.charge_after.getTime() + 1000)
    }
    return id
  }

  const state = async (tenantId: string) =>
    (await ops.query('select state from tenant_lifecycle where tenant_id = $1', [tenantId])).rows[0]
      .state

  /**
   * A moment `days` past the reminder's deadline.
   *
   * Measured from the reminder the run actually recorded, not from the wall
   * clock: these tenants are invoiced for March, so their dunning date is in
   * April and a real "today" would be months past every deadline.
   */
  const dayAfterDunning = async (tenantId: string, days: number) => {
    const { rows } = await ops.query(
      'select dunned_at from tenant_lifecycle where tenant_id = $1',
      [tenantId],
    )
    return new Date(rows[0].dunned_at.getTime() + (DUNNING_GRACE_DAYS + days) * 86_400_000)
  }

  async function anOperator() {
    const { rows } = await ops.query(
      `insert into operator (email, display_name) values ($1, 'Kulanz') returning id`,
      [`op-${randomUUID()}@example.test`],
    )
    operators.push(rows[0].id)
    return rows[0].id as string
  }

  it('issues one invoice, waits for the pre-notification, then collects and books the payment', async () => {
    const id = await computed({ paymentReady: true })
    const fake = fakeAdapters()

    // The run works across every tenant; what is asserted is this tenant's share.
    await invoicePeriods(ops, fake.adapters, options())
    const first = await period(id)
    await invoicePeriods(ops, fake.adapters, options())
    const invoiced = await period(id)
    expect(invoiced).toMatchObject({
      status: 'invoiced',
      gross_cents: 600,
      invoice_id: first.invoice_id,
    })
    const mine = (key: string) => key.startsWith(invoiced.invoice_ref)

    await chargeDue(ops, fake.adapters, options())
    expect(fake.charges.filter((c) => mine(c.idempotencyKey))).toHaveLength(0)

    const later = { now: new Date(APRIL_2.getTime() + 3 * 86_400_000) }
    await chargeDue(ops, fake.adapters, options(later))
    await chargeDue(ops, fake.adapters, options(later))
    expect(fake.charges.filter((c) => mine(c.idempotencyKey))).toEqual([
      expect.objectContaining({ amountCents: 600, idempotencyKey: `${invoiced.invoice_ref}-1` }),
    ])
    expect(await period(id)).toMatchObject({ status: 'paid' })
    expect(fake.payments.filter((p) => p.invoiceId === invoiced.invoice_id)).toEqual([
      expect.objectContaining({ amountCents: 600 }),
    ])
  })

  it('names the plan on the line, so accounting knows which product it is', async () => {
    // The accounting adapter has to pick a product, and a human-readable
    // description is the wrong thing to parse for that: a reworded line would
    // silently invoice against the wrong article.
    const id = await computed()
    const fake = fakeAdapters()
    await invoicePeriods(ops, fake.adapters, options())
    const invoice = fake.invoices.get((await period(id)).invoice_ref)
    expect(invoice?.lines).toEqual([expect.objectContaining({ plan: 'per_user', quantity: 1 })])
  })

  it('finds an invoice already issued instead of issuing a second one', async () => {
    const id = await computed()
    const fake = fakeAdapters()
    const ref = (await period(id)).invoice_ref
    await fake.adapters.invoicing.issueInvoice({
      customerRef: 'x',
      ref,
      lines: [{ description: 'earlier run', quantity: 1, unitNetCents: 500, plan: 'per_user' }],
      tax: { kind: 'domestic', country: 'AT', rate: 0.2 },
      collectedAfter: APRIL_2,
      locale: 'de',
    })
    await invoicePeriods(ops, fake.adapters, options())
    expect(fake.invoices.size).toBe(1)
    expect(await period(id)).toMatchObject({ status: 'invoiced', invoice_number: 'INV/2026/0001' })
  })

  it('keeps the invoice document, so a tenant can download its own', async () => {
    const id = await computed()
    const fake = fakeAdapters()
    await invoicePeriods(ops, fake.adapters, options())
    await storeInvoiceDocuments(ops, fake.adapters, options())
    await storeInvoiceDocuments(ops, fake.adapters, options())

    const { rows } = await ops.query(
      'select filename, byte_size, content from invoice_document where tenant_id = $1',
      [id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].byte_size).toBeGreaterThan(0)
    expect(rows[0].content.toString('utf8')).toContain('%PDF')
  })

  it('does not fail an invoice over a document it could not fetch', async () => {
    // The invoice is issued and sent; the PDF is a second step that may be
    // retried. Treating it as one would put a paid invoice into an error state.
    const id = await computed()
    const fake = fakeAdapters()
    fake.adapters.invoicing.invoiceDocument = async () => {
      throw new Error('accounting is down')
    }
    await invoicePeriods(ops, fake.adapters, options())
    await storeInvoiceDocuments(ops, fake.adapters, options())

    expect(await period(id)).toMatchObject({ status: 'invoiced' })
    const { rows } = await ops.query('select 1 from invoice_document where tenant_id = $1', [id])
    expect(rows).toHaveLength(0)
  })

  it('does nothing outside when it is a dry run', async () => {
    const id = await computed({ paymentReady: true })
    const fake = fakeAdapters()
    await invoicePeriods(ops, fake.adapters, options({ mode: 'dry_run' }))
    expect(fake.invoices.size).toBe(0)
    expect(fake.customers.size).toBe(0)
    expect(await period(id)).toMatchObject({ status: 'computed' })
  })

  it('holds an invoice whose tax is not what was billed', async () => {
    const id = await computed()
    const fake = fakeAdapters()
    const wrong: BillingAdapters = {
      ...fake.adapters,
      invoicing: {
        ...fake.adapters.invoicing,
        issueInvoice: async (input) => ({
          ...(await fake.adapters.invoicing.issueInvoice(input)),
          taxCents: 5,
          grossCents: 105,
        }),
      },
    }
    await invoicePeriods(ops, wrong, options())
    expect(await period(id)).toMatchObject({ status: 'held', hold_reason: 'invoice_mismatch' })
  })

  it('retries a declined charge after three and seven days, then makes the tenant read-only', async () => {
    const id = await computed({ paymentReady: true })
    const fake = fakeAdapters({ chargeOutcome: 'failed' })
    await invoicePeriods(ops, fake.adapters, options())

    let now = new Date(APRIL_2.getTime() + 3 * 86_400_000)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await chargeDue(ops, fake.adapters, options({ now }))
      const current = await period(id)
      expect(current.attempts).toBe(attempt)
      if (current.charge_after) now = new Date(current.charge_after.getTime() + 1000)
    }

    const current = await period(id)
    expect(current).toMatchObject({ status: 'failed', charge_after: null })
    expect(
      fake.charges
        .filter((c) => c.idempotencyKey.startsWith(current.invoice_ref))
        .map((c) => c.idempotencyKey.slice(-2)),
    ).toEqual(['-1', '-2', '-3'])
    const { rows } = await ops.query('select state from tenant_lifecycle where tenant_id = $1', [
      id,
    ])
    expect(rows[0].state).toBe('read_only')
    const email = `billing-${id.slice(0, 8)}@example.test`
    expect(notices.filter((n) => n.to === email).map((n) => n.kind)).toEqual([
      'payment_failed',
      'payment_failed',
      'payment_failed',
      'read_only',
      // The reminder § 5.4 wants before the access may be blocked, with the
      // date it would happen on.
      'dunning',
    ])
  })

  /**
   * The step the terms allow and the product never took: after a reminder that
   * went unanswered, the access itself closes (§ 5.4).
   *
   * What it must NOT do is lock somebody out of their own contents. They are
   * the customer's (§ 9.1), we hold them as their processor, and an unpaid
   * invoice is not a lien on them -- so the export stays open and only the
   * product closes.
   */
  it('blocks the access once the reminder has gone unanswered, and never the export', async () => {
    const id = await failedForGood()

    // A day before the deadline: nothing yet, or the reminder was no reminder.
    await dunningTransitions(ops, options({ now: await dayAfterDunning(id, -1) }))
    expect(await state(id)).toBe('read_only')

    notices = []
    await dunningTransitions(ops, options({ now: await dayAfterDunning(id, 1) }))
    expect(await state(id)).toBe('payment_blocked')
    const email = `billing-${id.slice(0, 8)}@example.test`
    expect(notices.filter((n) => n.to === email).map((n) => n.kind)).toEqual(['payment_blocked'])

    // Writes are refused by the database, whatever path tries them, and what is
    // left is the way out. Asked as the tenant, because both functions answer
    // about whoever the transaction says it is.
    await ops.query('begin')
    await ops.query(`select set_config('app.tenant_id', $1, true)`, [id])
    const access = await ops.query(
      `select app.cloud_tenant_access() as access, app.cloud_tenant_writable() as writable`,
    )
    await ops.query('commit')
    expect(access.rows[0]).toMatchObject({ access: 'export', writable: false })
  })

  it('reopens by itself when the money arrives, with nobody deciding anything', async () => {
    const id = await failedForGood()
    const blockedAt = await dayAfterDunning(id, 1)
    await dunningTransitions(ops, options({ now: blockedAt }))
    expect(await state(id)).toBe('payment_blocked')

    notices = []
    const fake = fakeAdapters()
    // The customer sorts the card out, so the next run has something to collect
    // again -- a failed period with its retry date reached.
    await ops.query(
      `update billing_period set charge_after = $2 where tenant_id = $1 and status = 'failed'`,
      [id, blockedAt],
    )
    await chargeDue(
      ops,
      fake.adapters,
      options({ now: new Date(blockedAt.getTime() + 86_400_000) }),
    )

    expect(await state(id)).toBe('active')
    expect(notices.map((n) => n.kind)).toContain('unblocked')
    const { rows } = await ops.query(
      'select dunned_at, grace_until from tenant_lifecycle where tenant_id = $1',
      [id],
    )
    expect(rows[0]).toEqual({ dunned_at: null, grace_until: null })
  })

  it('steps over a tenant an operator has given grace, and picks up where it stood', async () => {
    const id = await failedForGood()
    const operator = await anOperator()

    await ops.query('select app.op_grant_grace($1, $2, $3, $4)', [
      operator,
      id,
      7,
      'Karte abgelaufen, Kunde im Urlaub',
    ])
    expect(await state(id)).toBe('active')

    // Inside the grace: the ladder leaves it alone although the invoice is open.
    await dunningTransitions(ops, options({ now: await dayAfterDunning(id, 1) }))
    expect(await state(id)).toBe('active')

    // The grace does not settle the debt -- the period is still owed.
    const owed = await period(id)
    expect(owed.status).toBe('failed')

    // Once it runs out, the ladder carries on from where it stood: the reminder
    // was sent, so the next step is the block and not another reminder.
    const afterGrace = await dayAfterDunning(id, 9)
    await ops.query(
      `update tenant_lifecycle set state = 'read_only', grace_until = $2 where tenant_id = $1`,
      [id, new Date(afterGrace.getTime() - 86_400_000)],
    )
    await dunningTransitions(ops, options({ now: afterGrace }))
    expect(await state(id)).toBe('payment_blocked')

    const { rows } = await ops.query(
      `select action from operator_audit where tenant_id = $1 order by at desc limit 1`,
      [id],
    )
    expect(rows[0].action).toBe('grant_grace')
  })

  /**
   * Through `runBilling`, not through the step.
   *
   * Every other test here calls the steps directly, which is what let the call
   * to the dunning step fall out of `runBilling` during a rebase and stay green:
   * the function was still there, and nobody ran it. This one drives the run the
   * worker drives.
   */
  it('takes the step when the whole run goes past, not only when it is called', async () => {
    const id = await failedForGood()
    const now = await dayAfterDunning(id, 1)

    await runBilling(
      ops,
      null,
      async (vatId) => ({
        status: 'unavailable',
        vatId,
        error: 'not asked in this test',
        checkedAt: now.toISOString(),
      }),
      options({ now }),
    )

    expect(await state(id)).toBe('payment_blocked')
  })

  it('locks the tenant even when the notice cannot be sent', async () => {
    // The worker could not send mail at all -- it runs as the operations role
    // and the notice read a tenant's settings from the application database --
    // and a throwing notice undid the work before it: chargeDue's catch wrote
    // the status back to 'invoiced', nobody was locked, and the console, which
    // counts periods in 'failed', showed nothing at all. A notice is a side
    // effect; what was already written is the truth.
    const id = await computed({ paymentReady: true })
    const fake = fakeAdapters({ chargeOutcome: 'failed' })
    const mute = (overrides: Partial<RunOptions> = {}) =>
      options({
        notify: async () => {
          throw new Error('DATABASE_URL is not set.')
        },
        ...overrides,
      })
    await invoicePeriods(ops, fake.adapters, mute())

    let now = new Date(APRIL_2.getTime() + 3 * 86_400_000)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await chargeDue(ops, fake.adapters, mute({ now }))
      const current = await period(id)
      expect(current).toMatchObject({ status: 'failed', attempts: attempt })
      if (current.charge_after) now = new Date(current.charge_after.getTime() + 1000)
    }

    const { rows } = await ops.query('select state from tenant_lifecycle where tenant_id = $1', [
      id,
    ])
    expect(rows[0].state).toBe('read_only')
  })

  it('ends a trial even when the notice cannot be sent', async () => {
    // Same fault, worse reach: trials are step two of ten, so the exception
    // took the whole run down -- no invoices, no collection, every ten minutes.
    const id = await tenant({ state: 'trial', trialEndsAt: '2026-04-01T00:00:00Z' })
    await trialTransitions(
      ops,
      options({
        notify: async () => {
          throw new Error('DATABASE_URL is not set.')
        },
      }),
    )
    const { rows } = await ops.query('select state from tenant_lifecycle where tenant_id = $1', [
      id,
    ])
    expect(rows[0].state).toBe('read_only')
  })

  it('finishes a charge that was still processing when the provider reports it', async () => {
    const id = await computed({ paymentReady: true })
    const fake = fakeAdapters({ chargeOutcome: 'processing' })
    await invoicePeriods(ops, fake.adapters, options())
    await chargeDue(
      ops,
      fake.adapters,
      options({ now: new Date(APRIL_2.getTime() + 3 * 86_400_000) }),
    )
    const charging = await period(id)
    expect(charging.status).toBe('charging')

    const eventId = `evt-${randomUUID()}`
    await ops.query(`select app.cloud_record_payment_event($1, 'payment_succeeded', $2)`, [
      eventId,
      {
        id: eventId,
        type: 'payment_succeeded',
        paymentRef: charging.payment_ref,
        amountCents: 600,
      },
    ])
    // Stored twice, processed once.
    await ops.query(`select app.cloud_record_payment_event($1, 'payment_succeeded', '{}'::jsonb)`, [
      eventId,
    ])
    await processPaymentEvents(ops, fake.adapters, options())
    await processPaymentEvents(ops, fake.adapters, options())

    expect(await period(id)).toMatchObject({ status: 'paid' })
    expect(fake.payments.filter((p) => p.paymentRef === charging.payment_ref)).toHaveLength(1)
  })
})

describe('the trial', () => {
  it('reminds once four days and once one day before it ends', async () => {
    const id = await tenant({ state: 'trial', trialEndsAt: '2026-04-05T08:00:00Z' })
    const email = `billing-${id.slice(0, 8)}@example.test`
    await trialTransitions(ops, options())
    await trialTransitions(ops, options())
    await trialTransitions(ops, options({ now: new Date('2026-04-04T09:00:00Z') }))
    const mine = notices.filter((n) => n.to === email)
    expect(mine).toEqual([
      { kind: 'trial_ending', to: email, locale: 'de', daysLeft: 3 },
      { kind: 'trial_ending', to: email, locale: 'de', daysLeft: 1 },
    ])
  })

  it('writes to a customer in the language they registered in', async () => {
    // Everything the run sends used to be German, whatever the customer chose
    // on the website. The account remembers the language now.
    const id = await tenant({ state: 'trial', trialEndsAt: '2026-04-05T08:00:00Z', locale: 'fr' })
    await trialTransitions(ops, options())

    const email = `billing-${id.slice(0, 8)}@example.test`
    expect(notices.filter((n) => n.to === email)).toEqual([
      { kind: 'trial_ending', to: email, locale: 'fr', daysLeft: 3 },
    ])
  })

  it('ends read-only without a payment method, and active with one', async () => {
    const without = await tenant({ state: 'trial', trialEndsAt: '2026-04-01T00:00:00Z' })
    const withMethod = await tenant({
      state: 'trial',
      trialEndsAt: '2026-04-01T00:00:00Z',
      paymentReady: true,
    })
    await trialTransitions(ops, options())
    const { rows } = await ops.query(
      'select tenant_id, state from tenant_lifecycle where tenant_id = any($1::uuid[])',
      [[without, withMethod]],
    )
    expect(Object.fromEntries(rows.map((r) => [r.tenant_id, r.state]))).toEqual({
      [without]: 'read_only',
      [withMethod]: 'active',
    })
    expect(notices).toContainEqual(
      expect.objectContaining({ kind: 'read_only', reason: 'trial_ended' }),
    )
  })

  it('is unlocked by adding a payment method, which also counts as evidence of the country', async () => {
    const id = await tenant({
      state: 'read_only',
      trialEndsAt: '2026-03-01T00:00:00Z',
    })
    const eventId = `evt-${randomUUID()}`
    await ops.query(`select app.cloud_record_payment_event($1, 'payment_method_ready', $2)`, [
      eventId,
      {
        id: eventId,
        type: 'payment_method_ready',
        tenantId: id,
        customerRef: 'cus-new',
        country: 'AT',
      },
    ])
    await processPaymentEvents(ops, fakeAdapters().adapters, options())

    const { rows } = await ops.query(
      `select l.state, b.payment_method_ready, b.payment_customer_ref,
              (select array_agg(kind order by kind) from tax_evidence e where e.tenant_id = l.tenant_id) as evidence
         from tenant_lifecycle l join billing_account b using (tenant_id) where l.tenant_id = $1`,
      [id],
    )
    expect(rows[0]).toEqual({
      state: 'active',
      payment_method_ready: true,
      payment_customer_ref: 'cus-new',
      evidence: ['billing_address', 'payment_method'],
    })
  })
})

describe('VAT numbers VIES could not answer for', () => {
  it('are asked again, and a month held for them is billed afterwards', async () => {
    const id = await tenant({ country: 'DE', vatId: 'DE123456789', vatStatus: 'pending' })
    await interval(id, '2026-01-01T00:00:00Z', null)
    await closeMonth(ops, MARCH, options())
    expect(await period(id)).toMatchObject({ status: 'held' })

    await recheckPendingVat(
      ops,
      async (vatId) => ({
        status: 'valid',
        vatId,
        name: 'BILLING GMBH',
        address: null,
        consultationNumber: 'WAPI-RECHECK',
        checkedAt: APRIL_2.toISOString(),
      }),
      options(),
    )
    await closeMonth(ops, MARCH, options())
    expect(await period(id)).toMatchObject({ status: 'computed', tax_kind: 'reverse_charge' })
  })
})

/**
 * The six weeks AGB § 4.7 and § 14.3 promise before a change applies.
 *
 * Both used to be a sentence in the terms and nothing else: the price took
 * effect on the first of the coming month -- eleven days on the 20th -- and a
 * change of terms had no way of reaching anybody at all.
 */
describe('announcing a change six weeks ahead', () => {
  it('tells every workspace on that plan, once, and not again on the next pass', async () => {
    const id = await tenant({ plan: 'per_user' })
    const fake = fakeAdapters({ planPrices: { per_user: 700, per_workshop: 100 } })
    const mine = `billing-${id.slice(0, 8)}@example.test`

    notices = []
    await syncPlanPrices(ops, fake.adapters, options())
    const first = notices.filter((n) => n.to === mine)
    expect(first.map((n) => n.kind)).toEqual(['price_change'])

    // The worker passes every ten minutes. Nobody wants that mail 144 times.
    notices = []
    await syncPlanPrices(ops, fake.adapters, options())
    expect(notices.filter((n) => n.to === mine)).toEqual([])

    const { rows } = await ops.query(
      'select effective_from from price_change_notice where tenant_id = $1',
      [id],
    )
    const starts: Date = rows[0].effective_from
    expect((starts.getTime() - APRIL_2.getTime()) / 86_400_000).toBeGreaterThanOrEqual(42)
  })

  it('does not announce a price to a workspace on the other plan', async () => {
    const id = await tenant({ plan: 'per_workshop' })
    const fake = fakeAdapters({ planPrices: { per_user: 900, per_workshop: 100 } })
    const mine = `billing-${id.slice(0, 8)}@example.test`

    notices = []
    await syncPlanPrices(ops, fake.adapters, options())
    expect(notices.filter((n) => n.to === mine)).toEqual([])
  })

  it('carries an operator’s terms announcement out, once, and records what it told', async () => {
    const id = await tenant()
    const mine = `billing-${id.slice(0, 8)}@example.test`
    // A version of its own per run: an announcement is told once and stays
    // told, which is the point -- and would make this test pass only the first
    // time it ever ran.
    const version = `2027-01-${String((Date.now() % 28) + 1).padStart(2, '0')}-${id.slice(0, 4)}`
    announcements.push(version)
    await ops.query(
      `insert into legal_announcement (document, version, effective_from) values ('agb', $2, $1)`,
      [new Date(APRIL_2.getTime() + 60 * 86_400_000), version],
    )

    notices = []
    await pendingAnnouncements(ops, options())
    expect(notices.filter((n) => n.to === mine).map((n) => n.kind)).toEqual(['terms_change'])

    const { rows } = await ops.query(
      `select completed_at, told from legal_announcement where document = 'agb' and version = $1`,
      [version],
    )
    expect(rows[0].completed_at).not.toBeNull()
    expect(rows[0].told).toBeGreaterThan(0)

    // Announced again: the acknowledgement rows are what stops it, so a second
    // run tells nobody twice even if the announcement were reopened.
    notices = []
    await announceTermsChange(ops, 'agb', version, '2027-01-01', options())
    expect(notices.filter((n) => n.to === mine)).toEqual([])
  })
})

/**
 * Storage limitation, which the documentation used to hand to the operator.
 *
 * That is a fair answer for a self-hosted installation, where the operator is
 * the controller. In the cloud we are the processor and the sentence was a gap:
 * expired rows were treated as invalid when read and kept for ever.
 */
describe('sweeping what has expired', () => {
  it('deletes rows past their period and leaves the ones inside it', async () => {
    const id = await tenant()
    const old = new Date(APRIL_2.getTime() - 400 * 86_400_000)
    const recent = new Date(APRIL_2.getTime() - 2 * 86_400_000)

    await ops.query(
      `insert into audit_event (tenant_id, actor_member_id, source, action, entity_type, entity_id, created_at)
       values ($1, null, 'web', 'workshop.create', 'workshop', $2, $3),
              ($1, null, 'web', 'workshop.create', 'workshop', $4, $5)`,
      [id, randomUUID(), old, randomUUID(), recent],
    )

    await sweepExpired(ops, options())

    const { rows } = await ops.query(
      'select created_at from audit_event where tenant_id = $1 order by created_at',
      [id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].created_at.getTime()).toBe(recent.getTime())
  })

  it('does nothing at all in a dry run', async () => {
    const id = await tenant()
    const old = new Date(APRIL_2.getTime() - 400 * 86_400_000)
    await ops.query(
      `insert into audit_event (tenant_id, actor_member_id, source, action, entity_type, entity_id, created_at)
       values ($1, null, 'web', 'workshop.create', 'workshop', $2, $3)`,
      [id, randomUUID(), old],
    )

    await sweepExpired(ops, options({ mode: 'dry_run' }))

    const { rows } = await ops.query('select 1 from audit_event where tenant_id = $1', [id])
    expect(rows).toHaveLength(1)
  })
})
