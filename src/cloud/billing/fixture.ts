import { randomUUID } from 'node:crypto'
import type { PlanKey } from './plans'
import type { Db } from './run'

/**
 * A billing account in the tables, for tests and for the runs that put invoices
 * in front of a person.
 *
 * It lives next to the code rather than inside one test file because the
 * pictures of a product nobody tests are pictures of something else: an invoice
 * a person reviews has to come from the same tenant the tests make their
 * assertions about. The same reason `e2e/fixtures/seed-day.ts` is shared
 * between the specs and the marketing capture.
 *
 * Writes as the operations role, straight into the tables: the point is to have
 * a workspace in a given state, not to exercise the paths that get it there.
 */

export type BillingSetup = {
  plan?: PlanKey
  country?: string
  vatStatus?: string
  vatId?: string | null
  state?: 'trial' | 'active' | 'read_only'
  trialEndsAt?: string
  paymentReady?: boolean
  locale?: string
  /** Tells a row in an accounting system apart from a real customer. */
  companyName?: string
}

export type BillingFixture = ReturnType<typeof billingFixture>

export function billingFixture(ops: Db) {
  const tenants: string[] = []
  const operators: string[] = []
  const announcements: string[] = []

  return {
    /** Every id handed out, so a caller can clean up exactly what it made. */
    tenants,
    operators,
    announcements,

    async tenant(setup: BillingSetup = {}): Promise<string> {
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
           payment_method_ready, payment_customer_ref, locale)
         values ($1, $2, $3, 'Ring 1', '1010', 'Wien', $4, $5, $6, $7, $8, '2026-01-01', now(),
           $9, $10, $11)`,
        [
          id,
          'business',
          setup.companyName ?? 'Billing GmbH',
          setup.country ?? 'AT',
          setup.vatId ?? null,
          setup.vatStatus ?? 'none',
          `billing-${id.slice(0, 8)}@example.test`,
          setup.plan ?? 'per_user',
          setup.paymentReady ?? false,
          setup.paymentReady ? `cus-${id.slice(0, 8)}` : null,
          setup.locale ?? 'de',
        ],
      )
      await ops.query(
        `insert into tax_evidence (tenant_id, kind, country) values ($1, 'billing_address', $2)`,
        [id, setup.country ?? 'AT'],
      )
      return id
    },

    async interval(tenantId: string, from: string, to: string | null): Promise<void> {
      await ops.query(
        `insert into usage_member_interval (tenant_id, member_id, active_from, active_to) values ($1, $2, $3, $4)`,
        [tenantId, randomUUID(), from, to],
      )
    },

    async workshopCreated(tenantId: string, at: string, inTrial = false): Promise<void> {
      await ops.query(
        `insert into usage_workshop_created (workshop_id, tenant_id, created_at, in_trial) values ($1, $2, $3, $4)`,
        [randomUUID(), tenantId, at, inTrial],
      )
    },

    /** Everything this fixture made, and nothing a neighbouring file made. */
    async cleanup(): Promise<void> {
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
      await ops.query('delete from operator_audit where operator_id = any($1::uuid[])', [operators])
      await ops.query('delete from legal_announcement where version = any($1)', [announcements])
      await ops.query('delete from tenant where id = any($1::uuid[])', [tenants])
      await ops.query('delete from operator where id = any($1::uuid[])', [operators])
    },
  }
}
