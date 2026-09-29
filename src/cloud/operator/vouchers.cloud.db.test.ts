import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { billingFixture } from '@/cloud/billing/fixture'
import { VOUCHER_CODE } from '@/cloud/billing/voucher-code'
import {
  createVoucher,
  listVouchers,
  revokeVoucher,
  tenantRedemptions,
  VoucherCodeTakenError,
} from './vouchers'

/**
 * Vouchers from the console, as the role it runs as: made, listed, revoked --
 * and the voucher tables themselves as out of reach as every other table.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const operatorUrl =
  process.env.OPERATOR_DATABASE_URL ??
  (() => {
    const url = new URL(process.env.OPS_DATABASE_URL!)
    url.username = 'gw_operator'
    url.password = ''
    return url.toString()
  })()
const console_ = new pg.Pool({ connectionString: operatorUrl, max: 2 })
const fixture = billingFixture(ops)
let operatorId: string

const unique = () => `OPS-${randomUUID().slice(0, 8).toUpperCase()}`
const forever = { durationMonths: null, redeemableUntil: null, maxRedemptions: null, note: '' }

beforeAll(async () => {
  await ops.connect()
  const { rows } = await ops.query(
    `insert into operator (email, display_name) values ($1, 'Voucher Operator') returning id`,
    [`voucher-${randomUUID()}@example.test`],
  )
  operatorId = rows[0].id
  fixture.operators.push(operatorId)
})

afterAll(async () => {
  // No tenant_id: deleting the tenants does not take them along.
  const { rows } = await ops.query('select id from voucher where created_by = $1', [operatorId])
  fixture.vouchers.push(...rows.map((row) => row.id))
  await fixture.cleanup()
  await console_.end()
  await ops.end()
})

describe('what the console role can reach', () => {
  it.each(['voucher', 'voucher_redemption'])('cannot read %s directly', async (table) => {
    await expect(console_.query(`select 1 from ${table} limit 1`)).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('making a voucher', () => {
  it('takes a code as typed, lists it, and records who made it', async () => {
    const code = unique()
    const made = await createVoucher(console_, operatorId, {
      ...forever,
      code: `  ${code.toLowerCase()} `,
      percent: 25,
      durationMonths: 3,
      maxRedemptions: 10,
      note: 'Messe Wien',
    })
    expect(made.code).toBe(code)

    const listed = (await listVouchers(console_)).find((v) => v.id === made.id)
    expect(listed).toMatchObject({
      code,
      percent: 25,
      durationMonths: 3,
      maxRedemptions: 10,
      redemptions: 0,
      note: 'Messe Wien',
      createdBy: 'Voucher Operator',
      status: 'active',
    })

    const audit = await ops.query(
      `select detail from operator_audit where operator_id = $1 and action = 'create_voucher'`,
      [operatorId],
    )
    expect(audit.rows.map((row) => row.detail.code)).toContain(code)
  })

  it('makes up a readable code when none is given', async () => {
    const made = await createVoucher(console_, operatorId, { ...forever, code: '', percent: 100 })
    expect(made.code).toMatch(VOUCHER_CODE)
    expect(made.code).toHaveLength(10)
  })

  it('refuses a code that exists', async () => {
    const code = unique()
    await createVoucher(console_, operatorId, { ...forever, code, percent: 10 })
    await expect(
      createVoucher(console_, operatorId, { ...forever, code: code.toLowerCase(), percent: 50 }),
    ).rejects.toBeInstanceOf(VoucherCodeTakenError)
  })

  it.each([
    ['a discount of nothing', { percent: 0 }],
    ['more than everything', { percent: 101 }],
    ['a code that is not one', { code: 'a b' }],
    ['a date that has passed', { redeemableUntil: '2020-01-01T00:00:00Z' }],
    ['no months', { durationMonths: 0 }],
    ['no uses', { maxRedemptions: 0 }],
  ])('refuses %s', async (_, override) => {
    await expect(
      createVoucher(console_, operatorId, { ...forever, code: unique(), percent: 10, ...override }),
    ).rejects.toThrow()
  })
})

describe('the state of a voucher', () => {
  it('is revoked once revoked, and the revocation is in the audit log', async () => {
    const made = await createVoucher(console_, operatorId, {
      ...forever,
      code: unique(),
      percent: 10,
    })
    await revokeVoucher(console_, operatorId, made.id)
    await revokeVoucher(console_, operatorId, made.id)

    expect((await listVouchers(console_)).find((v) => v.id === made.id)?.status).toBe('revoked')
    const audit = await ops.query(
      `select count(*)::int as n from operator_audit
        where operator_id = $1 and action = 'revoke_voucher' and detail->>'code' = $2`,
      [operatorId, made.code],
    )
    // Revoking twice is one revocation.
    expect(audit.rows[0].n).toBe(1)
  })

  it('is used up when every use is spent, and expired after its date', async () => {
    const single = await createVoucher(console_, operatorId, {
      ...forever,
      code: unique(),
      percent: 10,
      maxRedemptions: 1,
    })
    await fixture.redeem(await fixture.tenant(), single.id, '2026-03-01')
    const dated = await createVoucher(console_, operatorId, {
      ...forever,
      code: unique(),
      percent: 10,
      redeemableUntil: new Date(Date.now() + 86_400_000).toISOString(),
    })

    const later = new Date(Date.now() + 2 * 86_400_000)
    const listed = await listVouchers(console_, later)
    expect(listed.find((v) => v.id === single.id)).toMatchObject({
      status: 'exhausted',
      redemptions: 1,
    })
    expect(listed.find((v) => v.id === dated.id)?.status).toBe('expired')
  })
})

describe('what a workspace has redeemed', () => {
  it('shows the terms it got and how many months are used', async () => {
    const tenantId = await fixture.tenant()
    const made = await createVoucher(console_, operatorId, {
      ...forever,
      code: unique(),
      percent: 30,
      durationMonths: 2,
    })
    await fixture.redeem(tenantId, made.id, '2026-03-01')

    expect(await tenantRedemptions(console_, tenantId)).toEqual([
      expect.objectContaining({
        code: made.code,
        percent: 30,
        durationMonths: 2,
        monthsUsed: 0,
        running: true,
      }),
    ])
  })
})
