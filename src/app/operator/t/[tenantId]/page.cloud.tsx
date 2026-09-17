import Link from 'next/link'
import type { Route } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { tenantDetail } from '@/cloud/operator/console'
import { currentOperator } from '@/cloud/operator/session'
import { TenantActions } from './tenant-actions'

export default async function OperatorTenant({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  if (!(await currentOperator())) redirect('/operator/login' as never)
  const { tenantId } = await params
  if (!/^[0-9a-f-]{36}$/.test(tenantId)) notFound()
  const [t, format, detail] = await Promise.all([
    getTranslations('operator'),
    getFormatter(),
    tenantDetail(operatorDb(), tenantId),
  ])
  if (!detail) notFound()
  const { tenant, periods, audit } = detail
  const date = (value: Date | null) =>
    value ? format.dateTime(value, { dateStyle: 'medium' }) : '–'
  const euro = (cents: number | null) =>
    cents === null ? '–' : format.number(cents / 100, { style: 'currency', currency: 'EUR' })

  const facts: [string, string][] = [
    [
      t('detail.state'),
      tenant.status === 'suspended' ? t('state.blocked') : t(`state.${tenant.state}`),
    ],
    [t('detail.trialEndsAt'), date(tenant.trialEndsAt)],
    [t('detail.deleteAfter'), date(tenant.deleteAfter)],
    [t('detail.plan'), tenant.plan ? t(`plan.${tenant.plan as 'per_user'}`) : '–'],
    [t('detail.country'), `${tenant.country ?? '–'} · ${tenant.vatStatus ?? '–'}`],
    [t('detail.payment'), tenant.paymentMethodReady ? t('detail.yes') : t('detail.no')],
    [t('tenants.members'), String(tenant.members)],
    [t('tenants.workshops'), String(tenant.workshops)],
    [t('tenants.created'), date(tenant.createdAt)],
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link href={'/operator' as Route} className="text-[14px] underline underline-offset-2">
          ← {t('tenants.title')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {tenant.companyName ?? tenant.name}
        </h1>
        <p className="text-[14px] text-[var(--fg-muted)]">
          {tenant.billingEmail} · {tenant.id}
        </p>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[12px] text-[var(--fg-subtle)] uppercase">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <TenantActions
        tenantId={tenant.id}
        state={tenant.state}
        blocked={tenant.status === 'suspended'}
      />

      <section>
        <h2 className="text-[17px] font-medium">{t('detail.periods')}</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <tbody className="divide-y divide-[var(--border)]">
              {periods.map((period) => (
                <tr key={period.id}>
                  <td className="py-2">{String(period.month).slice(0, 7)}</td>
                  <td>{period.quantity}</td>
                  <td>{euro(period.gross_cents ?? period.net_cents)}</td>
                  <td>{period.tax_kind}</td>
                  <td>
                    {period.status}
                    {period.hold_reason ? ` (${period.hold_reason})` : ''}
                  </td>
                  <td className="text-[12px] text-[var(--fg-muted)]">{period.last_error}</td>
                  <td>
                    {period.status === 'held' && (
                      <TenantActions.Release tenantId={tenant.id} periodId={period.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[17px] font-medium">{t('detail.audit')}</h2>
        <ul className="mt-2 divide-y divide-[var(--border)] text-[14px]">
          {audit.map((entry, index) => (
            <li key={index} className="py-2">
              {format.dateTime(entry.at, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
              {entry.operator} · {entry.action}
              {entry.detail?.reason ? ` · ${entry.detail.reason}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
