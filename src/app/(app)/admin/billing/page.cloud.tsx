import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { eq } from 'drizzle-orm'
import { readSessionCached } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { tenant } from '@/server/db/schema'
import { DELETION_GRACE_DAYS, readBillingOverview } from '@/cloud/workspace/account'
import { DeletePanel, DetailsPanel, InvoicesPanel, PaymentPanel, PlanPanel } from './billing-panels'

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
      <DeletePanel
        workspaceName={workspace[0]?.name ?? ''}
        deleteAfter={overview.deleteAfter?.toISOString() ?? null}
        graceDays={DELETION_GRACE_DAYS}
      />
    </div>
  )
}
