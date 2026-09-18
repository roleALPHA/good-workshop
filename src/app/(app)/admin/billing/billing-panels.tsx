'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { PLANS, type PlanKey } from '@/cloud/billing/plans'
import { SIGNUP_COUNTRIES } from '@/cloud/registration/rules'
import type { BillingOverview } from '@/cloud/workspace/account'
import {
  cancelWorkspaceDeletionAction,
  changePlanAction,
  requestWorkspaceDeletionAction,
  startPaymentSetupAction,
  updateBillingDetailsAction,
} from './actions'

const card = 'rounded border border-[var(--border)] bg-[var(--surface)] p-4'
const field =
  'mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 py-2 text-[16px]'
const primary =
  'min-h-11 rounded bg-[var(--brand)] px-4 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60'

type Result = { ok: boolean; message?: string }

function useAction() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const act = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const result = await fn()
      if (!result.ok) {
        setError(result.message ?? null)
        return
      }
      setError(null)
      after?.()
      router.refresh()
    })
  return { error, pending, act }
}

function Alert({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
      {message}
    </p>
  ) : null
}

export function PlanPanel({ overview }: { overview: BillingOverview }) {
  const t = useTranslations('admin.billing')
  const format = useFormatter()
  const [plan, setPlan] = useState(overview.nextPlan ?? overview.plan)
  const { error, pending, act } = useAction()
  // The price is read from the plan, not written into the label: otherwise it
  // has to be changed in four catalogs as well, and one of them is forgotten.
  const planLabel = (key: PlanKey) =>
    t(`plan.${key}`, {
      price: format.number(PLANS[key].netCents / 100, { style: 'currency', currency: 'EUR' }),
    })

  return (
    <section className={card} aria-labelledby="billing-plan">
      <h2 id="billing-plan" className="text-[17px] font-medium">
        {t('plan.title')}
      </h2>
      <p className="mt-1 text-[14px] text-[var(--fg-muted)]">{t('plan.hint')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label={t('plan.title')}
          value={plan}
          onChange={(e) => setPlan(e.target.value as typeof plan)}
          className="min-h-11 rounded border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[16px]"
        >
          <option value="per_user">{planLabel('per_user')}</option>
          <option value="per_workshop">{planLabel('per_workshop')}</option>
        </select>
        <button
          type="button"
          className={primary}
          disabled={pending || plan === (overview.nextPlan ?? overview.plan)}
          onClick={() => act(() => changePlanAction(plan))}
        >
          {t('plan.save')}
        </button>
      </div>
      {overview.nextPlan && (
        <p className="mt-2 text-[14px]">{t('plan.next', { plan: planLabel(overview.nextPlan) })}</p>
      )}
      <p className="mt-3 text-[14px] text-[var(--fg-muted)]">
        {t('usage.title')}:{' '}
        {overview.plan === 'per_user'
          ? t('usage.per_user', { quantity: format.number(overview.monthToDate.quantity) })
          : t('usage.per_workshop', { quantity: overview.monthToDate.quantity })}{' '}
        ·{' '}
        {t('usage.net', {
          amount: format.number(overview.monthToDate.netCents / 100, {
            style: 'currency',
            currency: 'EUR',
          }),
        })}
      </p>
      <Alert message={error} />
    </section>
  )
}

export function DetailsPanel({ overview }: { overview: BillingOverview }) {
  const t = useTranslations('admin.billing.details')
  const locale = useLocale()
  const countryName = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale])
  const { error, pending, act } = useAction()
  const [saved, setSaved] = useState(false)

  return (
    <section className={card} aria-labelledby="billing-details">
      <h2 id="billing-details" className="text-[17px] font-medium">
        {t('title')}
      </h2>
      <p className="mt-1 text-[14px] text-[var(--fg-muted)]">{t(`vat.${overview.vatStatus}`)}</p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          const raw = Object.fromEntries(new FormData(event.currentTarget).entries())
          setSaved(false)
          act(
            () => updateBillingDetailsAction(raw),
            () => setSaved(true),
          )
        }}
      >
        {(
          [
            ['companyName', overview.companyName, 'organization'],
            ['billingEmail', overview.billingEmail, 'email'],
            ['street', overview.street, 'street-address'],
            ['postalCode', overview.postalCode, 'postal-code'],
            ['city', overview.city, 'address-level2'],
            ['vatId', overview.vatId ?? '', 'off'],
          ] as const
        ).map(([name, value, autoComplete]) => (
          <label key={name} className="text-[14px] font-medium">
            {t(name)}
            <input name={name} defaultValue={value} autoComplete={autoComplete} className={field} />
          </label>
        ))}
        <label className="text-[14px] font-medium">
          {t('country')}
          <select name="country" defaultValue={overview.country} className={field}>
            {SIGNUP_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {countryName.of(code)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3 sm:col-span-2">
          <button type="submit" className={primary} disabled={pending}>
            {pending ? t('saving') : t('save')}
          </button>
          {saved && (
            <p role="status" className="pb-2 text-[14px] text-[var(--fg-muted)]">
              {t('saved')}
            </p>
          )}
        </div>
      </form>
      <Alert message={error} />
    </section>
  )
}

export function PaymentPanel({ ready }: { ready: boolean }) {
  const t = useTranslations('admin.billing.payment')
  const [unavailable, setUnavailable] = useState(false)
  const { error, pending, act } = useAction()

  return (
    <section className={card} aria-labelledby="billing-payment">
      <h2 id="billing-payment" className="text-[17px] font-medium">
        {t('title')}
      </h2>
      <p className="mt-1 text-[14px]">{ready ? t('ready') : t('missing')}</p>
      <button
        type="button"
        className={`${primary} mt-3`}
        disabled={pending}
        onClick={() =>
          act(async () => {
            const result = await startPaymentSetupAction()
            if (result.ok && result.data) window.location.assign(result.data.url)
            else if (result.ok) setUnavailable(true)
            return result
          })
        }
      >
        {ready ? t('change') : t('add')}
      </button>
      {unavailable && <p className="mt-2 text-[14px] text-[var(--warn-fg)]">{t('unavailable')}</p>}
      <Alert message={error} />
    </section>
  )
}

export function InvoicesPanel({ invoices }: { invoices: BillingOverview['invoices'] }) {
  const t = useTranslations('admin.billing.invoices')
  const format = useFormatter()
  const euro = (cents: number) => format.number(cents / 100, { style: 'currency', currency: 'EUR' })

  return (
    <section className={card} aria-labelledby="billing-invoices">
      <h2 id="billing-invoices" className="text-[17px] font-medium">
        {t('title')}
      </h2>
      {invoices.length === 0 ? (
        <p className="mt-1 text-[14px] text-[var(--fg-muted)]">{t('none')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {invoices.map((invoice) => (
            <li
              key={invoice.month}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[15px]"
            >
              <span className="min-w-20 font-medium">{invoice.month}</span>
              <span>{euro(invoice.grossCents ?? invoice.netCents)}</span>
              <span className="text-[var(--fg-muted)]">
                {t(`state.${invoice.status as 'paid'}`)}
              </span>
              {invoice.url && (
                <a
                  href={invoice.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {invoice.number ?? t('open')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function DeletePanel({
  workspaceName,
  deleteAfter,
  graceDays,
}: {
  workspaceName: string
  deleteAfter: string | null
  graceDays: number
}) {
  const t = useTranslations('admin.billing.delete')
  const format = useFormatter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const { error, pending, act } = useAction()

  if (deleteAfter) {
    return (
      <section className={card} aria-labelledby="billing-delete">
        <h2 id="billing-delete" className="text-[17px] font-medium">
          {t('title')}
        </h2>
        <p className="mt-1 text-[15px]">
          {t('scheduled', { date: format.dateTime(new Date(deleteAfter), { dateStyle: 'long' }) })}
        </p>
        <button
          type="button"
          className={`${primary} mt-3`}
          disabled={pending}
          onClick={() => act(() => cancelWorkspaceDeletionAction())}
        >
          {t('undo')}
        </button>
        <Alert message={error} />
      </section>
    )
  }

  return (
    <section className={card} aria-labelledby="billing-delete">
      <h2 id="billing-delete" className="text-[17px] font-medium">
        {t('title')}
      </h2>
      <p className="mt-1 text-[14px] text-[var(--fg-muted)]">{t('intro')}</p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 min-h-11 rounded border border-[var(--border-strong)] px-4 text-[15px] text-[var(--danger-fg)] hover:bg-[var(--surface-raised)]"
        >
          {t('open')}
        </button>
      ) : (
        <div className="mt-3">
          <p className="text-[14px]">{t('warning', { days: String(graceDays) })}</p>
          <label
            htmlFor="delete-workspace"
            className="mt-3 block text-[13px] text-[var(--fg-muted)]"
          >
            {t('typeName', { name: workspaceName })}
          </label>
          <input
            id="delete-workspace"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className={field}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="min-h-11 rounded border border-[var(--border-strong)] px-3 text-[14px] hover:bg-[var(--surface-raised)]"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={pending || typed.trim() !== workspaceName.trim()}
              onClick={() => act(() => requestWorkspaceDeletionAction())}
              className="min-h-11 rounded bg-[var(--danger-fg)] px-3 text-[14px] text-[var(--bg)] disabled:opacity-40"
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      )}
      <Alert message={error} />
    </section>
  )
}
