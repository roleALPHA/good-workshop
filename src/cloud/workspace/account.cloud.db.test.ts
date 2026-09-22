import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { edition } from '@/server/edition'
import { fakeAdapters } from '@/cloud/billing/adapters/fake'
import { closeMonth, purgeDeletedTenants, type RunOptions } from '@/cloud/billing/run'
import { previousMonth } from '@/cloud/billing/usage'
import {
  DELETION_GRACE_DAYS,
  cancelWorkspaceDeletion,
  changePlan,
  readBillingOverview,
  requestWorkspaceDeletion,
  startPaymentSetup,
  updateBillingDetails,
} from './account'

/**
 * A workspace's commercial side as its admin changes it -- and the deletion that
 * ends it, against a cloud database.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const tenants: string[] = []
const identities: string[] = []

const options = (now: Date): RunOptions => ({
  now,
  mode: 'live',
  maxInvoiceCents: 100_000,
  collectAfterDays: 2,
  notify: async () => {},
  log: () => {},
})

async function workspace(state = 'active') {
  const tenantId = randomUUID()
  const identityId = randomUUID()
  const memberId = randomUUID()
  tenants.push(tenantId)
  identities.push(identityId)
  await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Verwaltung')`, [
    tenantId,
    `adm-${tenantId.slice(0, 8)}`,
  ])
  await ops.query(`insert into identity (id, email) values ($1, $2)`, [
    identityId,
    `adm-${identityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'admin', 'active')`,
    [memberId, tenantId, identityId],
  )
  await ops.query(
    `insert into tenant_lifecycle (tenant_id, state, trial_ends_at) values ($1, $2, '2026-01-01T00:00:00Z')`,
    [tenantId, state],
  )
  await ops.query(
    `insert into billing_account (tenant_id, customer_type, company_name, street, postal_code, city, country,
       billing_email, plan, plan_from, terms_accepted_at)
     values ($1, 'business', 'Verwaltung GmbH', 'Ring 1', '1010', 'Wien', 'AT', 'rechnung@example.test',
       'per_user', '2026-01-01', now())`,
    [tenantId],
  )
  const admin: Actor = { tenantId, memberId, tenantRole: 'admin', source: 'web' }
  const member: Actor = { ...admin, tenantRole: 'member' }
  return { tenantId, identityId, memberId, admin, member }
}

beforeAll(async () => {
  await ops.connect()
})

afterAll(async () => {
  for (const table of [
    'billing_period',
    'billing_account',
    'tax_evidence',
    'vat_check',
    'usage_member_interval',
  ]) {
    await ops.query(`delete from ${table} where tenant_id = any($1::uuid[])`, [tenants])
  }
  await ops.query('delete from tenant where id = any($1::uuid[])', [tenants])
  await ops.query('delete from identity where id = any($1::uuid[])', [identities])
  await ops.end()
})

describe('the billing overview', () => {
  it('shows the plan, the account and this month so far -- to admins only', async () => {
    const { admin, member } = await workspace()
    const overview = await readBillingOverview(admin)
    expect(overview).toMatchObject({
      state: 'active',
      plan: 'per_user',
      nextPlan: null,
      companyName: 'Verwaltung GmbH',
      vatStatus: 'none',
      paymentMethodReady: false,
      invoices: [],
    })
    // The admin became active when the membership was created, today.
    expect(overview!.monthToDate.quantity).toBeGreaterThan(0)
    await expect(readBillingOverview(member)).rejects.toThrow('member.adminOnly')
  })
})

describe('changing the plan', () => {
  it('takes effect on the first of the coming month, and is refused to members', async () => {
    const { tenantId, admin, member } = await workspace()
    await expect(changePlan(member, 'per_workshop')).rejects.toThrow('member.adminOnly')
    await changePlan(admin, 'per_workshop')
    expect(await readBillingOverview(admin)).toMatchObject({
      plan: 'per_user',
      nextPlan: 'per_workshop',
    })

    // The date the change was booked for, rather than one written into the
    // test: `cloud_change_plan` reads the database clock, and a fixed date here
    // would pass or fail depending on the month the suite happens to run in.
    const { rows: pending } = await ops.query(
      'select next_plan_from from billing_account where tenant_id = $1',
      [tenantId],
    )
    const effective: Date = pending[0].next_plan_from

    await closeMonth(ops, previousMonth(effective), options(effective))
    const { rows } = await ops.query(
      'select plan, next_plan, next_plan_from, plan_from from billing_account where tenant_id = $1',
      [tenantId],
    )
    expect(rows[0]).toMatchObject({ plan: 'per_workshop', next_plan: null, next_plan_from: null })
    expect(rows[0].plan_from).toEqual(effective)
  })

  it('leaves the running month on the old plan when the run happens mid-month', async () => {
    const { tenantId, admin } = await workspace()
    await changePlan(admin, 'per_workshop')

    // The worker closes the previous month on every run, ten minutes apart. A
    // plan chosen on the 15th must not reach into the month it was chosen in --
    // otherwise the switch is retroactive to the first, and the customer is
    // billed for two weeks under a model they had not picked yet.
    await closeMonth(ops, '2026-08-01', options(new Date('2026-09-15T06:00:00Z')))

    const { rows } = await ops.query(
      'select plan, next_plan from billing_account where tenant_id = $1',
      [tenantId],
    )
    expect(rows[0]).toEqual({ plan: 'per_user', next_plan: 'per_workshop' })
  })

  it('cannot be forced through the database by somebody who is not an admin', async () => {
    const { member } = await workspace()
    await expect(
      withTenant(member, (tx) =>
        tx.execute(`select app.cloud_change_plan('per_workshop')` as never),
      ),
    ).rejects.toThrow()
  })
})

describe('billing details', () => {
  it('checks a VAT number, keeps the answer, and refuses an invalid one', async () => {
    const { tenantId, admin } = await workspace()
    const valid = async (vatId: string) => ({
      status: 'valid' as const,
      vatId,
      name: 'ANDERS GMBH',
      address: null,
      consultationNumber: 'WAPI-ADMIN',
      checkedAt: new Date().toISOString(),
    })
    await updateBillingDetails(
      admin,
      {
        companyName: 'Anders GmbH',
        street: 'Allee 2',
        postalCode: '10115',
        city: 'Berlin',
        country: 'DE',
        vatId: 'DE123456789',
        billingEmail: 'buchhaltung@example.test',
      },
      valid,
    )
    expect(await readBillingOverview(admin)).toMatchObject({
      companyName: 'Anders GmbH',
      country: 'DE',
      vatStatus: 'valid',
      billingEmail: 'buchhaltung@example.test',
    })
    const checks = await ops.query(
      'select consultation_number from vat_check where tenant_id = $1',
      [tenantId],
    )
    expect(checks.rows).toEqual([{ consultation_number: 'WAPI-ADMIN' }])

    await expect(
      updateBillingDetails(
        admin,
        {
          companyName: 'X',
          street: 'Y',
          postalCode: '1',
          city: 'Z',
          country: 'DE',
          vatId: 'DE000000000',
          billingEmail: 'a@example.test',
        },
        async (vatId) => ({ ...(await valid(vatId)), status: 'invalid' as const }),
      ),
    ).rejects.toThrow('signup.vatIdInvalid')
  })
})

describe('the payment method', () => {
  it('opens the provider’s page and remembers the customer', async () => {
    const { tenantId, admin } = await workspace()
    const url = await startPaymentSetup(
      admin,
      fakeAdapters().adapters,
      'https://app.example.test/admin/billing',
    )
    expect(url).toContain(tenantId)
    const { rows } = await ops.query(
      'select payment_customer_ref from billing_account where tenant_id = $1',
      [tenantId],
    )
    expect(rows[0].payment_customer_ref).toBe(`cus-${tenantId.slice(0, 8)}`)
  })
})

describe('deleting a workspace', () => {
  it('makes it read-only at once, stops counting members, and can be taken back', async () => {
    const { tenantId, admin } = await workspace()
    const until = await requestWorkspaceDeletion(admin)
    expect(until.getTime() - Date.now()).toBeGreaterThan((DELETION_GRACE_DAYS - 1) * 86_400_000)

    expect(await withTenant(admin, (tx) => edition.tenantWritable(tx))).toBe(false)
    const open = await ops.query(
      'select count(*)::int as n from usage_member_interval where tenant_id = $1 and active_to is null',
      [tenantId],
    )
    expect(open.rows[0].n).toBe(0)

    await cancelWorkspaceDeletion(admin)
    expect(await readBillingOverview(admin)).toMatchObject({ state: 'active', deleteAfter: null })
    expect(await withTenant(admin, (tx) => edition.tenantWritable(tx))).toBe(true)
    const reopened = await ops.query(
      'select count(*)::int as n from usage_member_interval where tenant_id = $1 and active_to is null',
      [tenantId],
    )
    expect(reopened.rows[0].n).toBe(1)
  })

  it('is refused to a member', async () => {
    const { member } = await workspace()
    await expect(requestWorkspaceDeletion(member)).rejects.toThrow('member.adminOnly')
  })

  it('is carried out after the grace period, once the month is invoiced, and keeps the bookkeeping', async () => {
    const { tenantId, identityId, admin, memberId } = await workspace()
    const workshopId = uuidv7()
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Verschwindet', $3, 'a0')`,
      [workshopId, tenantId, memberId],
    )
    await requestWorkspaceDeletion(admin)
    await ops.query(
      `update tenant_lifecycle set deletion_requested_at = '2026-08-10T10:00:00Z', delete_after = '2026-09-09T10:00:00Z'
        where tenant_id = $1`,
      [tenantId],
    )

    // Grace period over, but August not closed yet: wait.
    const now = new Date('2026-09-10T06:00:00Z')
    await purgeDeletedTenants(ops, options(now))
    expect((await ops.query('select 1 from tenant where id = $1', [tenantId])).rowCount).toBe(1)

    await closeMonth(ops, '2026-08-01', options(now))
    await purgeDeletedTenants(ops, options(now))

    expect((await ops.query('select 1 from tenant where id = $1', [tenantId])).rowCount).toBe(0)
    expect((await ops.query('select 1 from workshop where id = $1', [workshopId])).rowCount).toBe(0)
    expect((await ops.query('select 1 from identity where id = $1', [identityId])).rowCount).toBe(0)
    expect(
      (await ops.query('select 1 from billing_account where tenant_id = $1', [tenantId])).rowCount,
    ).toBe(1)
    expect(
      (await ops.query('select 1 from billing_period where tenant_id = $1', [tenantId])).rowCount,
    ).toBe(1)
    expect(
      (await ops.query('select 1 from usage_workshop_created where tenant_id = $1', [tenantId]))
        .rowCount,
    ).toBe(1)
  })
})
