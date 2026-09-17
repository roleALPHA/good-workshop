import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Bot, Printer, Share2, Timer, Users } from 'lucide-react'
import { readSessionCached } from '@/server/auth/session'
import { SiteShell } from './site-shell'

/**
 * The cloud's front page. Somebody already signed in has no use for a sales
 * page and goes straight to their library.
 */
export default async function CloudHome() {
  if (await readSessionCached().catch(() => null)) redirect('/library')
  const t = await getTranslations('site.home')

  const features = [
    ['plan', Timer],
    ['together', Users],
    ['ai', Bot],
    ['share', Share2],
    ['print', Printer],
  ] as const

  return (
    <SiteShell>
      <section className="max-w-2xl py-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[var(--fg-muted)]">{t('lead')}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={'/registrieren' as Route}
            className="rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
          >
            {t('cta')}
          </Link>
          <Link
            href={'/preise' as Route}
            className="rounded border border-[var(--border-strong)] px-4 py-3 text-[16px] hover:bg-[var(--surface-raised)]"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
        <p className="mt-3 text-[14px] text-[var(--fg-subtle)]">{t('trialNote')}</p>
      </section>

      <section className="mt-10" aria-labelledby="features">
        <h2 id="features" className="text-xl font-semibold tracking-tight">
          {t('featuresTitle')}
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([key, Icon]) => (
            <li key={key} className="rounded border border-[var(--border)] bg-[var(--surface)] p-4">
              <Icon aria-hidden className="size-5 text-[var(--brand)]" />
              <h3 className="mt-2 text-[16px] font-medium">{t(`${key}.title`)}</h3>
              <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t(`${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  )
}
