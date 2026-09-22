import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fakeAdapters } from './adapters/fake'
import {
  chargeDue,
  closeMonth,
  storeInvoiceDocuments,
  syncPlanPrices,
  invoicePeriods,
  processPaymentEvents,
  recheckPendingVat,
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
const tenants: string[] = []
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

type Setup = {
  plan?: 'per_user' | 'per_workshop'
  country?: string
  vatStatus?: string
  vatId?: string | null
  state?: 'trial' | 'active' | 'read_only'
  trialEndsAt?: string
  paymentReady?: boolean
}

/** A tenant with a billing account, straight into the tables. */
async function tenant(setup: Setup = {}) {
  const id = randomUUID()
  tenants.push(id)
  await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Billing')`, [
    id,
    `bill-${id.slice(0, 8)}`,
  ])
  await ops.query(
    `insert into tenant_lifecycle (tenant_id, state, trial_ends_at) values ($1, $2, $3)`,
    [id, setup.state ?? 'active', setup.trialEndsAt ?? '2026-01-15T00:00:00Z'],
  )
  await ops.query(
    `insert into billing_account (tenant_id, customer_type, company_name, street, postal_code, city,
       country, vat_id, vat_status, billing_email, plan, plan_from, terms_accepted_at,
       payment_method_ready, payment_customer_ref)
     values ($1, $2, 'Billing GmbH', 'Ring 1', '1010', 'Wien', $3, $4, $5, $6, $7, '2026-01-01', now(),
       $8, $9)`,
    [
      id,
      'business',
      setup.country ?? 'AT',
      setup.vatId ?? null,
      setup.vatStatus ?? 'none',
      `billing-${id.slice(0, 8)}@example.test`,
      setup.plan ?? 'per_user',
      setup.paymentReady ?? false,
      setup.paymentReady ? `cus-${id.slice(0, 8)}` : null,
    ],
  )
  await ops.query(
    `insert into tax_evidence (tenant_id, kind, country) values ($1, 'billing_address', $2)`,
    [id, setup.country ?? 'AT'],
  )
  return id
}

async function interval(tenantId: string, from: string, to: string | null) {
  await ops.query(
    `insert into usage_member_interval (tenant_id, member_id, active_from, active_to) values ($1, $2, $3, $4)`,
    [tenantId, randomUUID(), from, to],
  )
}

async function workshopCreated(tenantId: string, at: string, inTrial = false) {
  await ops.query(
    `insert into usage_workshop_created (workshop_id, tenant_id, created_at, in_trial) values ($1, $2, $3, $4)`,
    [randomUUID(), tenantId, at, inTrial],
  )
}

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
  for (const table of [
    'billing_period',
    'billing_account',
    'tax_evidence',
    'vat_check',
    'usage_member_interval',
    'usage_workshop_created',
  ]) {
    await ops.query(`delete from ${table} where tenant_id = any($1::uuid[])`, [tenants])
  }
  await ops.query('delete from tenant where id = any($1::uuid[])', [tenants])
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

  it('records a change from the first of the coming month, not today', async () => {
    // A raise mid-month must not reach the month that is running: existing
    // customers are told beforehand, and this is that promise in the data.
    const fake = fakeAdapters()
    fake.prices.set('per_user', 900)
    await syncPlanPrices(ops, fake.adapters, options({ now: new Date('2026-09-18T10:00:00Z') }))

    const { rows } = await ops.query(
      `select net_cents, to_char(effective_from, 'YYYY-MM-DD') as from_day
         from plan_price where plan = 'per_user' and source = 'accounting'`,
    )
    expect(rows).toEqual([{ net_cents: 900, from_day: '2026-10-01' }])
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
  async function computed(setup: Setup = {}) {
    const id = await tenant(setup)
    await interval(id, '2026-01-01T00:00:00Z', null)
    await closeMonth(ops, MARCH, options())
    return id
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
    ])
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
      { kind: 'trial_ending', to: email, daysLeft: 3 },
      { kind: 'trial_ending', to: email, daysLeft: 1 },
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
