import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Bot, Euro, Server, ShieldCheck, Smartphone } from 'lucide-react'
import { SOURCE_URL } from '@/lib/attribution'
import type { Locale } from '@/i18n/config'
import { pathFor } from './routes'
import { breadcrumb, JsonLd } from './structured-data'

/**
 * For the person searching "SessionLab alternative".
 *
 * Two rules, and the second one is why this page is worth having at all:
 *
 *  1. Nothing is claimed about the other product beyond what it plainly is.
 *     Feature tables about somebody else's software are wrong within a
 *     quarter, and a comparison that is wrong about them is not believed
 *     about us either.
 *  2. The page says where GoodWorkshop is the weaker choice, by name and
 *     without hedging. A reader who arrived by searching for an alternative
 *     is comparing on purpose; the fastest way to lose them is a page that
 *     reads as if it had never heard of a trade-off.
 */
const POINTS = [
  ['selfHost', Server],
  ['ai', Bot],
  ['data', ShieldCheck],
  ['pricing', Euro],
  ['room', Smartphone],
] as const

export async function Compare() {
  const [t, nav, locale] = await Promise.all([
    getTranslations('site.compare'),
    getTranslations('site.nav'),
    getLocale() as Promise<Locale>,
  ])

  return (
    <div>
      <JsonLd data={breadcrumb('compare', locale, t('title'), nav('home'))} />

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
      <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-[var(--fg-muted)]">
        {t('lead')}
      </p>
      <p className="mt-4 max-w-3xl rounded border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--fg-muted)]">
        {t('neutral')}
      </p>

      <section className="mt-10" aria-labelledby="points">
        <h2 id="points" className="text-xl font-semibold tracking-tight">
          {t('pointsTitle')}
        </h2>
        <ul className="mt-4 grid max-w-4xl gap-4 sm:grid-cols-2">
          {POINTS.map(([key, Icon]) => (
            <li key={key} className="rounded border border-[var(--border)] bg-[var(--surface)] p-4">
              <Icon aria-hidden className="size-5 text-[var(--brand)]" />
              <h3 className="mt-2 text-[17px] font-medium">{t(`${key}.title`)}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[var(--fg-muted)]">
                {t(`${key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Deliberately not a footnote and not below the fold: this is the
          section the reader came for. */}
      <section
        className="mt-10 max-w-3xl border-t border-[var(--border)] pt-8"
        aria-labelledby="limits"
      >
        <h2 id="limits" className="text-xl font-semibold tracking-tight">
          {t('limitsTitle')}
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--fg-muted)]">{t('limitsBody')}</p>
        <p className="mt-3 text-[15px]">
          <Link href={pathFor('methods', locale) as Route} className="underline underline-offset-2">
            {nav('methods')}
          </Link>
        </p>
      </section>

      <section
        className="mt-10 max-w-3xl rounded border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="compare-cta"
      >
        <h2 id="compare-cta" className="text-xl font-semibold tracking-tight">
          {t('ctaTitle')}
        </h2>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('ctaBody')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={'/registrieren' as Route}
            className="inline-flex min-h-11 items-center rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
          >
            {t('cta')}
          </Link>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded border border-[var(--border-strong)] px-4 py-3 text-[16px] hover:bg-[var(--surface-raised)]"
          >
            {t('ctaSecondary')}
          </a>
        </div>
      </section>
    </div>
  )
}
