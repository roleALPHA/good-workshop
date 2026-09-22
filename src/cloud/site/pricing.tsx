import Link from 'next/link'
import type { Route } from 'next'
import { getFormatter, getLocale, getTranslations } from 'next-intl/server'
import type { PlanKey } from '@/cloud/billing/plans'
import { readPriceList } from '@/cloud/billing/price-list'
import { SOURCE_URL } from '@/lib/attribution'
import type { Locale } from '@/i18n/config'
import { breadcrumb, JsonLd, softwareApplication } from './structured-data'

/**
 * Both models, for businesses. Net prices, because GoodWorkshop Cloud is not
 * offered to consumers -- the page says so before it says anything else.
 *
 * The numbers come from the accounting system, recorded by the billing worker.
 * When they cannot be had, the page says so instead of naming a price nobody
 * has confirmed.
 */
export async function Pricing() {
  const [t, nav, format, locale, priceList] = await Promise.all([
    getTranslations('site.pricing'),
    getTranslations('site.nav'),
    getFormatter(),
    getLocale() as Promise<Locale>,
    readPriceList(),
  ])
  const euro = (cents: number) => format.number(cents / 100, { style: 'currency', currency: 'EUR' })

  const plans: PlanKey[] = ['per_user', 'per_workshop']
  const copy = { per_user: 'perUser', per_workshop: 'perWorkshop' } as const

  return (
    <div>
      {/* The only page that states a price, so the only page that may put one
          in its markup -- and only the prices it printed. A plan whose price
          the accounting system did not return shows a dash above and is left
          out here rather than guessed at. */}
      <JsonLd
        data={softwareApplication({
          locale,
          name: 'GoodWorkshop',
          description: t('intro'),
          offers: plans.flatMap((key) => {
            const netCents = priceList.prices[key]
            return netCents === null
              ? []
              : [{ price: netCents / 100, unit: t(`${copy[key]}.unit`) }]
          }),
        })}
      />
      <JsonLd data={breadcrumb('pricing', locale, t('title'), nav('home'))} />

      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-3 max-w-2xl rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3 text-[15px]">
        {t('businessOnly')}
      </p>
      <p className="mt-4 max-w-2xl text-[17px] text-[var(--fg-muted)]">{t('intro')}</p>

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
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

        {/* The third way to have GoodWorkshop, and the honest one to name on a
            page about prices: running it yourself costs nothing, and the zero
            is formatted like the others rather than written into a sentence. */}
        <li className="flex flex-col rounded border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-xl font-semibold tracking-tight">{t('selfHost.name')}</h2>
          <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('selfHost.unit')}</p>
          <p className="mt-4 text-3xl font-semibold">{euro(0)}</p>
          <p className="text-[13px] text-[var(--fg-muted)]">{t('selfHost.free')}</p>
          <p className="mt-4 flex-1 text-[15px]">{t('selfHost.body')}</p>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 items-center underline underline-offset-2"
          >
            {t('selfHost.cta')}
          </a>
        </li>
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
