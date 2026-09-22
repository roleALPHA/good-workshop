import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { eq } from 'drizzle-orm'
import { readSessionCached } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { tenant } from '@/server/db/schema'
import { readBillingOverview } from '@/cloud/workspace/account'
import { DELETION_GRACE_DAYS } from '@/cloud/billing/plans'
import {
  CancelPanel,
  DeletePanel,
  DetailsPanel,
  InvoicesPanel,
  PaymentPanel,
  PlanPanel,
} from './billing-panels'

export const dynamic = 'force-dynamic'

/** Billing, for the tenant's admins. Only a cloud build has this route. */
export default async function BillingPage() {
  const session = await readSessionCached()
  if (!session || session.tenantRole !== 'admin') notFound()

  const actor = {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    source: 'web' as const,
  }
  const [t, format, overview, workspace] = await Promise.all([
    getTranslations('admin.billing'),
    getFormatter(),
    readBillingOverview(actor),
    withTenant(actor, (tx) =>
      tx.select({ name: tenant.name }).from(tenant).where(eq(tenant.id, session.tenantId)).limit(1),
    ),
  ])
  if (!overview) notFound()

  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: 'long' }) : '')

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>
        <p className="mt-2 text-[15px]">
          <span className="text-[var(--fg-muted)]">{t('status.label')}: </span>
          {t(`status.${overview.state}`, {
            date: date(overview.state === 'trial' ? overview.trialEndsAt : overview.deleteAfter),
          })}
        </p>
      </div>
      <PlanPanel overview={overview} />
      <PaymentPanel ready={overview.paymentMethodReady} />
      <DetailsPanel overview={overview} />
      <InvoicesPanel invoices={overview.invoices} />
      {/* Once a deletion is under way there is nothing left to give notice
          about -- the contract is over either way, and two panels offering to
          end the same thing would only be a question about which one wins. */}
      {!overview.deleteAfter && (
        <CancelPanel
          contractEndsOn={overview.contractEndsOn?.toISOString() ?? null}
          graceDays={DELETION_GRACE_DAYS}
        />
      )}
      <DeletePanel
        workspaceName={workspace[0]?.name ?? ''}
        deleteAfter={overview.deleteAfter?.toISOString() ?? null}
        graceDays={DELETION_GRACE_DAYS}
      />
    </div>
  )
}
