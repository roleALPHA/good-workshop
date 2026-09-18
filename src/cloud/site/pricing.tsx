import Link from 'next/link'
import type { Route } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { PlanKey } from '@/cloud/billing/plans'
import { readPriceList } from '@/cloud/billing/price-list'

/**
 * Both models, for businesses. Net prices, because GoodWorkshop Cloud is not
 * offered to consumers -- the page says so before it says anything else.
 *
 * The numbers come from the accounting system, recorded by the billing worker.
 * When they cannot be had, the page says so instead of naming a price nobody
 * has confirmed.
 */
export async function Pricing() {
  const [t, format, priceList] = await Promise.all([
    getTranslations('site.pricing'),
    getFormatter(),
    readPriceList(),
  ])
  const euro = (cents: number) => format.number(cents / 100, { style: 'currency', currency: 'EUR' })

  const plans: PlanKey[] = ['per_user', 'per_workshop']
  const copy = { per_user: 'perUser', per_workshop: 'perWorkshop' } as const

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-3 max-w-2xl rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3 text-[15px]">
        {t('businessOnly')}
      </p>
      <p className="mt-4 max-w-2xl text-[17px] text-[var(--fg-muted)]">{t('intro')}</p>

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {plans.map((key) => {
          const netCents = priceList.prices[key]
          const c = copy[key]
          return (
            <li
              key={key}
              className="flex flex-col rounded border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <h2 className="text-xl font-semibold tracking-tight">{t(`${c}.name`)}</h2>
              <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t(`${c}.unit`)}</p>
              <p className="mt-4 text-3xl font-semibold">
                {netCents === null ? '—' : euro(netCents)}
              </p>
              <p className="text-[13px] text-[var(--fg-muted)]">
                {netCents === null ? t('unavailable') : t('net')}
              </p>
              <p className="mt-4 flex-1 text-[15px]">{t(`${c}.body`)}</p>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 max-w-2xl text-[14px] text-[var(--fg-muted)]">{t('vatNote')}</p>
      <p className="mt-2 text-[15px]">{t('trial')}</p>
      <Link
        href={'/registrieren' as Route}
        className="mt-4 inline-block rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
      >
        {t('cta')}
      </Link>
    </div>
  )
}
