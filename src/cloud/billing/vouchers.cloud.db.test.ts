import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fakeAdapters } from './adapters/fake'
import { billingFixture } from './fixture'
import { discountedNetCents } from './usage'
import type { RunOptions } from './context'
import { closeMonth } from './periods'
import { invoicePeriods } from './invoicing'
import { chargeDue } from './collecting'

/**
 * What a redeemed voucher does to the months the run closes: which months it
 * discounts, by how much, and that a month it covers entirely is never
 * invoiced. Redeeming itself is tested with the workspace, in
 * src/cloud/workspace/voucher.cloud.db.test.ts.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const fixture = billingFixture(ops)
const { tenant, interval, voucher, redeem } = fixture

const FEBRUARY = '2026-02-01'
const MARCH = '2026-03-01'
const APRIL = '2026-04-01'
const MAY = '2026-05-01'
/** The run that closes a month happens on the second of the next. */
const closing: Record<string, Date> = {
  [MARCH]: new Date('2026-04-02T08:00:00Z'),
  [APRIL]: new Date('2026-05-02T08:00:00Z'),
  [MAY]: new Date('2026-06-02T08:00:00Z'),
}

const options = (now: Date): RunOptions => ({
  now,
  mode: 'live',
  maxInvoiceCents: 100_000,
  collectAfterDays: 2,
  notify: async () => {},
  log: () => {},
})

const close = (month: string) => closeMonth(ops, month, options(closing[month]!))

const periodOf = async (tenantId: string, month: string) =>
  (
    await ops.query('select * from billing_period where tenant_id = $1 and month = $2', [
      tenantId,
      month,
    ])
  ).rows[0]

/** A paying workspace with one member, active since before March. */
async function paying(setup: Parameters<typeof tenant>[0] = {}) {
  const id = await tenant({ paymentReady: true, ...setup })
  await interval(id, '2026-01-20T00:00:00Z', null)
  return id
}

beforeAll(async () => {
  await ops.connect()
  // The invoicing and charging steps work across all tenants; periods left
  // behind by an earlier run of this file would be picked up again.
  await ops.query(
    `delete from billing_period where status in ('computed', 'invoiced', 'failed', 'charging')`,
  )
})

afterAll(async () => {
  await fixture.cleanup()
  await ops.end()
})

describe('a month a voucher discounts', () => {
  it('is billed at the discounted amount, and the invoice shows the discount', async () => {
    const id = await paying()
    const { id: voucherId, code } = await voucher({ percent: 20 })
    const redemption = await redeem(id, voucherId, FEBRUARY)

    await close(MARCH)
    const period = await periodOf(id, MARCH)
    expect(period).toMatchObject({
      status: 'computed',
      discount_percent: 20,
      voucher_code: code,
      voucher_redemption_id: redemption,
    })
    expect(period.net_cents).toBe(
      discountedNetCents(Number(period.quantity), period.unit_net_cents, 20),
    )
    expect(period.net_cents).toBeGreaterThan(0)

    const fake = fakeAdapters()
    await invoicePeriods(ops, fake.adapters, options(closing[MARCH]!))
    const invoice = fake.invoices.get(period.invoice_ref)!
    expect(invoice.netCents).toBe(period.net_cents)
    expect(invoice.lines).toEqual([
      expect.objectContaining({
        discountPercent: 20,
        unitNetCents: period.unit_net_cents,
        description: expect.stringContaining(`Gutschein ${code}`),
      }),
    ])
    // Checked against what was computed, and believed.
    expect(await periodOf(id, MARCH)).toMatchObject({ status: 'invoiced' })
  })

  it('that costs nothing is not invoiced and not charged', async () => {
    const id = await paying()
    const { id: voucherId } = await voucher({ percent: 100, durationMonths: 1 })
    await redeem(id, voucherId, MARCH)

    await close(MARCH)
    const period = await periodOf(id, MARCH)
    expect(period).toMatchObject({ status: 'void', net_cents: 0, discount_percent: 100 })
    expect(Number(period.quantity)).toBeGreaterThan(0)

    const fake = fakeAdapters()
    await invoicePeriods(ops, fake.adapters, options(closing[MARCH]!))
    await chargeDue(ops, fake.adapters, options(new Date('2026-04-10T08:00:00Z')))
    expect(fake.invoices.has(period.invoice_ref)).toBe(false)
    expect(fake.charges.filter((c) => c.idempotencyKey.startsWith(period.invoice_ref))).toEqual([])
    expect(await periodOf(id, MARCH)).toMatchObject({ status: 'void' })
  })
})

describe('which months a voucher discounts', () => {
  it('as many as it runs for, then the full price again', async () => {
    const id = await paying()
    const { id: voucherId } = await voucher({ percent: 50, durationMonths: 2 })
    await redeem(id, voucherId, MARCH)

    for (const month of [MARCH, APRIL, MAY]) await close(month)
    expect((await periodOf(id, MARCH)).discount_percent).toBe(50)
    expect((await periodOf(id, APRIL)).discount_percent).toBe(50)
    expect(await periodOf(id, MAY)).toMatchObject({
      discount_percent: null,
      voucher_code: null,
      voucher_redemption_id: null,
    })
  })

  it('every month, for one without an end', async () => {
    const id = await paying()
    const { id: voucherId } = await voucher({ percent: 10, durationMonths: null })
    await redeem(id, voucherId, MARCH)

    for (const month of [MARCH, APRIL, MAY]) await close(month)
    for (const month of [MARCH, APRIL, MAY])
      expect((await periodOf(id, month)).discount_percent).toBe(10)
  })

  it('none before the month it was redeemed in', async () => {
    const id = await paying()
    const { id: voucherId } = await voucher({ percent: 50, durationMonths: 1 })
    await redeem(id, voucherId, APRIL)

    await close(MARCH)
    await close(APRIL)
    expect((await periodOf(id, MARCH)).discount_percent).toBeNull()
    // And the month it did not discount did not use it up.
    expect((await periodOf(id, APRIL)).discount_percent).toBe(50)
  })

  it('from the first billed month, when it was redeemed during the trial', async () => {
    // The trial runs into April: March is not billed at all, so it cannot use
    // up a month of the voucher.
    const id = await paying({ state: 'trial', trialEndsAt: '2026-04-10T00:00:00Z' })
    const { id: voucherId } = await voucher({ percent: 50, durationMonths: 1 })
    await redeem(id, voucherId, MARCH)

    for (const month of [MARCH, APRIL, MAY]) await close(month)
    expect(await periodOf(id, MARCH)).toBeUndefined()
    expect((await periodOf(id, APRIL)).discount_percent).toBe(50)
    expect((await periodOf(id, MAY)).discount_percent).toBeNull()
  })

  it('whatever happens to the voucher afterwards', async () => {
    const id = await paying()
    const { id: voucherId } = await voucher({ percent: 30, durationMonths: 2 })
    await redeem(id, voucherId, MARCH)
    await ops.query('update voucher set revoked_at = now(), percent = 90 where id = $1', [
      voucherId,
    ])

    await close(MARCH)
    // Revoking stops new redemptions; what the workspace was given, it keeps --
    // on the terms it was given.
    expect((await periodOf(id, MARCH)).discount_percent).toBe(30)
  })
})
