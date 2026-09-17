import Link from 'next/link'
import type { Route } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import { PLANS, grossCents, type PlanKey } from '@/cloud/billing/plans'

/**
 * Both models, both audiences.
 *
 * Businesses read net prices, consumers must be shown gross ones (§ 9 PrAG) --
 * so the page shows both side by side rather than behind a toggle a consumer
 * might never touch. The numbers come from src/cloud/billing/plans.ts, the same
 * file the billing run reads.
 */
export async function Pricing() {
  const [t, format] = await Promise.all([getTranslations('site.pricing'), getFormatter()])
  const euro = (cents: number) => format.number(cents / 100, { style: 'currency', currency: 'EUR' })

  const plans: PlanKey[] = ['per_user', 'per_workshop']
  const copy = { per_user: 'perUser', per_workshop: 'perWorkshop' } as const

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-2xl text-[17px] text-[var(--fg-muted)]">{t('intro')}</p>

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {plans.map((key) => {
          const plan = PLANS[key]
          const c = copy[key]
          return (
            <li
              key={key}
              className="flex flex-col rounded border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <h2 className="text-xl font-semibold tracking-tight">{t(`${c}.name`)}</h2>
              <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t(`${c}.unit`)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[13px] text-[var(--fg-subtle)]">{t('business')}</dt>
                  <dd className="text-2xl font-semibold">{euro(plan.netCents)}</dd>
                  <dd className="text-[13px] text-[var(--fg-muted)]">{t('net')}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-[var(--fg-subtle)]">{t('consumer')}</dt>
                  <dd className="text-2xl font-semibold">{euro(grossCents(plan.netCents))}</dd>
                  <dd className="text-[13px] text-[var(--fg-muted)]">{t('gross')}</dd>
                </div>
              </dl>
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
