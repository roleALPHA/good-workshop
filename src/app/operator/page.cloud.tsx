import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listTenants } from '@/cloud/operator/console'
import { currentOperator } from '@/cloud/operator/session'
import { SignOut } from './sign-out'

export default async function OperatorHome({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string }>
}) {
  const operator = await currentOperator()
  if (!operator) redirect('/operator/login' as never)
  const [{ state, q }, t, format, tenants] = await Promise.all([
    searchParams,
    getTranslations('operator'),
    getFormatter(),
    listTenants(operatorDb()),
  ])
  const needle = q?.trim().toLowerCase()
  const shown = tenants.filter(
    (tenant) =>
      (!state || (state === 'blocked' ? tenant.status === 'suspended' : tenant.state === state)) &&
      (!needle ||
        [tenant.name, tenant.companyName, tenant.billingEmail]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle))),
  )
  const filters = ['', 'trial', 'active', 'read_only', 'paused', 'deleting', 'blocked'] as const

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('tenants.title')}</h1>
        <p className="text-[14px] text-[var(--fg-muted)]">
          {operator.displayName} · <SignOut />
        </p>
      </div>
      <form className="mt-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          aria-label={t('tenants.search')}
          placeholder={t('tenants.search')}
          className="min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[15px]"
        />
        <select
          name="state"
          defaultValue={state ?? ''}
          aria-label={t('tenants.filter')}
          className="min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[15px]"
        >
          {filters.map((value) => (
            <option key={value} value={value}>
              {value ? t(`state.${value}`) : t('tenants.all')}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="min-h-11 rounded border border-[var(--border-strong)] px-3 text-[15px]"
        >
          {t('tenants.apply')}
        </button>
      </form>
      <p className="mt-2 text-[13px] text-[var(--fg-muted)]">
        {t('tenants.count', { count: shown.length })}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead className="text-[12px] text-[var(--fg-subtle)] uppercase">
            <tr>
              <th className="py-2">{t('tenants.name')}</th>
              <th>{t('tenants.state')}</th>
              <th>{t('tenants.plan')}</th>
              <th>{t('tenants.members')}</th>
              <th>{t('tenants.workshops')}</th>
              <th>{t('tenants.attention')}</th>
              <th>{t('tenants.created')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {shown.map((tenant) => (
              <tr key={tenant.id}>
                <td className="py-2">
                  <Link
                    href={`/operator/t/${tenant.id}` as Route}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {tenant.companyName ?? tenant.name}
                  </Link>
                  <div className="text-[12px] text-[var(--fg-muted)]">{tenant.billingEmail}</div>
                </td>
                <td>
                  {tenant.status === 'suspended' ? t('state.blocked') : t(`state.${tenant.state}`)}
                </td>
                <td>{tenant.plan ? t(`plan.${tenant.plan as 'per_user'}`) : '–'}</td>
                <td>{tenant.members}</td>
                <td>{tenant.workshops}</td>
                <td>
                  {[
                    tenant.heldPeriods
                      ? t('tenants.held', { count: String(tenant.heldPeriods) })
                      : null,
                    tenant.failedPeriods
                      ? t('tenants.failed', { count: String(tenant.failedPeriods) })
                      : null,
                    !tenant.paymentMethodReady && tenant.state !== 'trial'
                      ? t('tenants.noPayment')
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
                <td>{format.dateTime(tenant.createdAt, { dateStyle: 'medium' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
