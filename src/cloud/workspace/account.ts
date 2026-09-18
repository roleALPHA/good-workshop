import { sql } from 'drizzle-orm'
import { withTenant, type Actor, type Tx } from '@/server/db'
import { assertTenantAdmin } from '@/domain/tenant/members'
import { isPlanKey, type PlanKey } from '@/cloud/billing/plans'
import { readPriceList } from '@/cloud/billing/price-list'
import { memberMonths, viennaDay, type Interval } from '@/cloud/billing/usage'
import type { BillingAdapters } from '@/cloud/billing/ports'
import { parseBillingDetails, parseBillingEmail, SignupError } from '@/cloud/registration/rules'
import type { VatCheck } from '@/cloud/tax/vies'

/**
 * A workspace's commercial side, as its admins see and change it.
 *
 * Reads go through the tenant's own policies; every write is one of the
 * functions in drizzle-cloud/sql/955_tenant_admin.sql, which act on the current
 * tenant only and refuse anybody who is not its admin -- checked here as well,
 * so the refusal is a sentence rather than a database error.
 */

export const DELETION_GRACE_DAYS = 30

export type WorkspaceState = 'trial' | 'active' | 'read_only' | 'paused' | 'deleting'

export type BillingOverview = {
  state: WorkspaceState
  trialEndsAt: Date | null
  deleteAfter: Date | null
  plan: PlanKey
  nextPlan: PlanKey | null
  companyName: string
  street: string
  postalCode: string
  city: string
  country: string
  vatId: string | null
  vatStatus: 'none' | 'valid' | 'invalid' | 'pending'
  billingEmail: string
  paymentMethodReady: boolean
  /** What each plan costs today, from the accounting system. Null when unknown. */
  prices: Record<PlanKey, number | null>
  /** What this month comes to so far, before tax. */
  monthToDate: { quantity: number; netCents: number }
  invoices: {
    month: string
    status: string
    netCents: number
    grossCents: number | null
    number: string | null
    url: string | null
  }[]
}

type Row = Record<string, unknown>

/**
 * Raw queries through drizzle come back with timestamps and dates as strings,
 * not Date objects (its node-postgres driver switches the type parsers off).
 */
const toDate = (value: unknown): Date | null =>
  value === null || value === undefined ? null : new Date(value as string)
const rows = async (tx: Tx, query: ReturnType<typeof sql>) =>
  ((await tx.execute(query)) as unknown as { rows: Row[] }).rows

export async function readBillingOverview(
  actor: Actor,
  now = new Date(),
): Promise<BillingOverview | null> {
  assertTenantAdmin(actor)
  const priceList = await readPriceList(now)
  return withTenant(actor, async (tx) => {
    const [account] = await rows(
      tx,
      sql`select b.*, l.state, l.trial_ends_at, l.delete_after
            from billing_account b join tenant_lifecycle l using (tenant_id)`,
    )
    if (!account) return null

    const plan = isPlanKey(account.plan) ? account.plan : 'per_user'
    const month = `${viennaDay(now).slice(0, 7)}-01`

    let quantity: number
    if (plan === 'per_user') {
      // A day's margin: which Vienna day an instant belongs to is memberMonths' call.
      const windowStart = new Date(new Date(`${month}T00:00:00Z`).getTime() - 86_400_000)
      const intervals = await rows(
        tx,
        sql`select member_id, active_from, active_to from usage_member_interval
             where active_to is null or active_to >= ${windowStart.toISOString()}::timestamptz`,
      )
      quantity = memberMonths(
        intervals.map((row): Interval => ({
          memberId: row.member_id as string,
          activeFrom: toDate(row.active_from)!,
          activeTo: toDate(row.active_to),
        })),
        month,
        { billableFrom: toDate(account.trial_ends_at), until: now },
      )
    } else {
      const created = await rows(
        tx,
        sql`select created_at from usage_workshop_created where not in_trial`,
      )
      quantity = created.filter(
        (row) => viennaDay(toDate(row.created_at)!).slice(0, 7) === month.slice(0, 7),
      ).length
    }

    const invoices = await rows(
      tx,
      sql`select month, status, net_cents, gross_cents, invoice_number, invoice_url
            from billing_period where status not in ('void') order by month desc limit 24`,
    )

    return {
      state: account.state as WorkspaceState,
      trialEndsAt: toDate(account.trial_ends_at),
      deleteAfter: toDate(account.delete_after),
      plan,
      nextPlan: isPlanKey(account.next_plan) ? account.next_plan : null,
      companyName: (account.company_name as string | null) ?? '',
      street: account.street as string,
      postalCode: account.postal_code as string,
      city: account.city as string,
      country: account.country as string,
      vatId: (account.vat_id as string | null) ?? null,
      vatStatus: account.vat_status as BillingOverview['vatStatus'],
      billingEmail: account.billing_email as string,
      paymentMethodReady: Boolean(account.payment_method_ready),
      prices: priceList.prices,
      monthToDate: {
        quantity,
        netCents: Math.round(quantity * (priceList.prices[plan] ?? 0)),
      },
      invoices: invoices.map((row) => ({
        // A `date` column: already the calendar month, no time zone involved.
        month: String(row.month).slice(0, 7),
        status: row.status as string,
        netCents: row.net_cents as number,
        grossCents: (row.gross_cents as number | null) ?? null,
        number: (row.invoice_number as string | null) ?? null,
        url: (row.invoice_url as string | null) ?? null,
      })),
    }
  })
}

export async function changePlan(actor: Actor, plan: unknown): Promise<void> {
  assertTenantAdmin(actor)
  if (!isPlanKey(plan)) throw new SignupError('signup.plan')
  await withTenant(actor, (tx) => tx.execute(sql`select app.cloud_change_plan(${plan})`))
}

export async function updateBillingDetails(
  actor: Actor,
  raw: Record<string, unknown>,
  check: (vatId: string) => Promise<VatCheck>,
): Promise<void> {
  assertTenantAdmin(actor)
  const details = parseBillingDetails(raw)
  const billingEmail = parseBillingEmail(raw.billingEmail)
  const vatCheck = details.vatId ? await check(details.vatId) : null
  if (vatCheck?.status === 'invalid') throw new SignupError('signup.vatIdInvalid')

  await withTenant(actor, (tx) =>
    tx.execute(sql`select app.cloud_update_billing_details(
      ${details.companyName}, ${details.street}, ${details.postalCode}, ${details.city},
      ${details.country}, ${details.vatId}, ${billingEmail},
      ${vatCheck ? JSON.stringify(vatCheck) : null}::jsonb)`),
  )
}

/** Opens the payment provider's page for a payment method; returns where to send the browser. */
export async function startPaymentSetup(
  actor: Actor,
  adapters: BillingAdapters,
  returnUrl: string,
): Promise<string> {
  assertTenantAdmin(actor)
  const account = await withTenant(actor, async (tx) => {
    const [row] = await rows(
      tx,
      sql`select payment_customer_ref, billing_email from billing_account`,
    )
    return row
  })
  if (!account) throw new SignupError('signup.address')

  const session = await adapters.payments.createSetupSession({
    tenantId: actor.tenantId,
    customerRef: (account.payment_customer_ref as string | null) ?? null,
    email: account.billing_email as string,
    returnUrl,
  })
  await withTenant(actor, (tx) =>
    tx.execute(sql`select app.cloud_set_payment_customer(${session.customerRef})`),
  )
  return session.url
}

export async function requestWorkspaceDeletion(actor: Actor): Promise<Date> {
  assertTenantAdmin(actor)
  return withTenant(actor, async (tx) => {
    const [row] = await rows(
      tx,
      sql`select app.cloud_request_own_deletion(${DELETION_GRACE_DAYS}) as delete_after`,
    )
    return toDate(row!.delete_after)!
  })
}

export async function cancelWorkspaceDeletion(actor: Actor): Promise<void> {
  assertTenantAdmin(actor)
  await withTenant(actor, (tx) => tx.execute(sql`select app.cloud_cancel_own_deletion()`))
}
