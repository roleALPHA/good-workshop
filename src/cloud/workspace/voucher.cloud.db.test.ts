import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { billingFixture } from '@/cloud/billing/fixture'
import { discountedNetCents } from '@/cloud/billing/usage'
import { readBillingOverview } from './account'
import { redeemVoucher } from './voucher'

/**
 * Redeeming a voucher, as a workspace admin does it next to the payment
 * method -- against a cloud database, because every refusal is the database's.
 * What a redeemed voucher does to an invoice is src/cloud/billing/vouchers.cloud.db.test.ts.
 */

type Rows = { rows: unknown[] }

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const fixture = billingFixture(ops)
const identities: string[] = []

async function workspace() {
  const tenantId = await fixture.tenant()
  const identityId = randomUUID()
  const memberId = randomUUID()
  identities.push(identityId)
  await ops.query(`insert into identity (id, email) values ($1, $2)`, [
    identityId,
    `v-${identityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'admin', 'active')`,
    [memberId, tenantId, identityId],
  )
  const admin: Actor = { tenantId, memberId, tenantRole: 'admin', source: 'web' }
  const member: Actor = { ...admin, tenantRole: 'member' }
  return { tenantId, admin, member }
}

beforeAll(async () => {
  await ops.connect()
})

afterAll(async () => {
  await ops.query('delete from member where identity_id = any($1::uuid[])', [identities])
  await fixture.cleanup()
  await ops.query('delete from identity where id = any($1::uuid[])', [identities])
  await ops.end()
})

describe('redeeming a voucher', () => {
  it('records it for the workspace, whatever way it was typed, and shows it on the billing page', async () => {
    const { admin, tenantId } = await workspace()
    const { code } = await fixture.voucher({ percent: 20, durationMonths: 3 })

    expect(await redeemVoucher(admin, `  ${code.toLowerCase()} `)).toEqual({
      code,
      percent: 20,
      durationMonths: 3,
      monthsLeft: 3,
    })
    const { rows } = await ops.query(
      'select code, percent, duration_months from voucher_redemption where tenant_id = $1',
      [tenantId],
    )
    expect(rows).toEqual([{ code, percent: 20, duration_months: 3 }])

    const overview = await readBillingOverview(admin)
    expect(overview!.voucher).toEqual({ code, percent: 20, durationMonths: 3, monthsLeft: 3 })
    // This month so far is what will be invoiced for it: after the discount.
    expect(overview!.monthToDate.netCents).toBe(
      discountedNetCents(overview!.monthToDate.quantity, overview!.prices.per_user!, 20),
    )
  })

  it('is for admins only', async () => {
    const { member } = await workspace()
    const { code } = await fixture.voucher()
    await expect(redeemVoucher(member, code)).rejects.toThrow('member.adminOnly')
  })

  it.each([
    ['a code that does not exist', async () => 'NO-SUCH-CODE', 'voucher.unknown'],
    ['something that cannot be a code', async () => 'x', 'voucher.unknown'],
    [
      // The same sentence as an unknown one: which codes exist is not
      // something to find out by trying.
      'a revoked code',
      async () => {
        const { id, code } = await fixture.voucher()
        await ops.query('update voucher set revoked_at = now() where id = $1', [id])
        return code
      },
      'voucher.unknown',
    ],
    [
      'an expired code',
      async () => {
        const { id, code } = await fixture.voucher()
        await ops.query(
          `update voucher set redeemable_until = now() - interval '1 day' where id = $1`,
          [id],
        )
        return code
      },
      'voucher.expired',
    ],
    [
      'a single-use code somebody else used',
      async () => {
        const { id, code } = await fixture.voucher({ maxRedemptions: 1 })
        const other = await fixture.tenant()
        await fixture.redeem(other, id, '2026-03-01')
        return code
      },
      'voucher.exhausted',
    ],
  ])('refuses %s', async (_, make, key) => {
    const { admin, tenantId } = await workspace()
    const code = await make()
    await expect(redeemVoucher(admin, code)).rejects.toThrow(key)
    const { rows } = await ops.query('select 1 from voucher_redemption where tenant_id = $1', [
      tenantId,
    ])
    expect(rows).toHaveLength(0)
  })

  it('once per workspace, and one at a time', async () => {
    const { admin } = await workspace()
    const first = await fixture.voucher({ durationMonths: null })
    const second = await fixture.voucher()

    await redeemVoucher(admin, first.code)
    await expect(redeemVoucher(admin, first.code)).rejects.toThrow('voucher.alreadyRedeemed')
    await expect(redeemVoucher(admin, second.code)).rejects.toThrow('voucher.active')
  })

  it('takes a new one once the last has run its months', async () => {
    const { admin, tenantId } = await workspace()
    const first = await fixture.voucher({ durationMonths: 1 })
    const second = await fixture.voucher()
    const redemption = await fixture.redeem(tenantId, first.id, '2026-03-01')
    await ops.query(
      `insert into billing_period (tenant_id, month, plan, quantity, unit_net_cents, net_cents,
         tax_kind, status, invoice_ref, voucher_redemption_id, discount_percent, voucher_code)
       values ($1, '2026-03-01', 'per_user', 1, 500, 400, 'domestic', 'void', $2, $3, 20, $4)`,
      [tenantId, `GW-VOUCHER-${tenantId}`, redemption, first.code],
    )

    expect((await readBillingOverview(admin))!.voucher).toBeNull()
    await expect(redeemVoucher(admin, second.code)).resolves.toMatchObject({ code: second.code })
  })

  it('spends the last use of a code once, however many ask at the same moment', async () => {
    const { code } = await fixture.voucher({ maxRedemptions: 1 })
    const admins = await Promise.all(Array.from({ length: 5 }, () => workspace()))

    const outcomes = await Promise.allSettled(admins.map(({ admin }) => redeemVoucher(admin, code)))
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    expect(
      outcomes
        .filter((o): o is PromiseRejectedResult => o.status === 'rejected')
        .map((o) => (o.reason as Error).message),
    ).toEqual(Array(4).fill('voucher.exhausted'))
  })
})

describe('what a workspace can see of vouchers', () => {
  it('its own redemption, and not a single code', async () => {
    const { admin, tenantId } = await workspace()
    const neighbour = await workspace()
    const { id, code } = await fixture.voucher()
    await fixture.redeem(neighbour.tenantId, id, '2026-03-01')

    const read = (query: string) =>
      withTenant(admin, async (tx) => ((await tx.execute(sql.raw(query))) as unknown as Rows).rows)
    expect(await read('select * from voucher')).toEqual([])
    expect(await read('select * from voucher_redemption')).toEqual([])

    await redeemVoucher(admin, code)
    expect(await read('select tenant_id from voucher_redemption')).toEqual([
      { tenant_id: tenantId },
    ])
  })

  it('cannot write a redemption, or a voucher, around the function', async () => {
    const { admin, tenantId } = await workspace()
    const { id } = await fixture.voucher()
    await expect(
      withTenant(admin, (tx) =>
        tx.execute(sql`insert into voucher_redemption (tenant_id, voucher_id, code, percent, redeemed_month)
                       values (${tenantId}, ${id}, 'X', 100, '2026-03-01')`),
      ),
    ).rejects.toThrow()
    await expect(
      withTenant(admin, (tx) =>
        tx.execute(sql.raw(`insert into voucher (code, percent) values ('FREE-FOR-ME', 100)`)),
      ),
    ).rejects.toThrow()
  })
})
