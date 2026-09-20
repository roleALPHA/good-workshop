import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Bot, Github, Printer, Share2, Timer, Users } from 'lucide-react'
import { readSessionCached } from '@/server/auth/session'
import { SOURCE_URL } from '@/lib/attribution'
import { SiteShell } from './site-shell'

/**
 * The cloud's front page. Somebody already signed in has no use for a sales
 * page and goes straight to their library.
 */
export default async function CloudHome() {
  if (await readSessionCached().catch(() => null)) redirect('/library')
  const [t, locale] = await Promise.all([getTranslations('site.home'), getLocale()])

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

      {/* The product itself, before the list of what it does. The pictures are
          taken from the running application by e2e/marketing.capture.ts, so
          what is advertised here is what the tests run against. */}
      <section className="mt-8">
        <Image
          src={`/marketing/${locale}/agenda.png`}
          alt={t('shotAgenda')}
          width={1280}
          height={860}
          priority
          sizes="(min-width: 1024px) 64rem, 100vw"
          className="h-auto w-full rounded-lg border border-[var(--border)] shadow-sm"
        />
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

      <section className="mt-10" aria-labelledby="shots">
        <h2 id="shots" className="text-xl font-semibold tracking-tight">
          {t('shotsTitle')}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Image
            src={`/marketing/${locale}/library.png`}
            alt={t('shotLibrary')}
            width={1280}
            height={860}
            sizes="(min-width: 640px) 42rem, 100vw"
            className="h-auto w-full rounded-lg border border-[var(--border)] shadow-sm"
          />
          <Image
            src={`/marketing/${locale}/phone.png`}
            alt={t('shotPhone')}
            width={390}
            height={844}
            sizes="16rem"
            className="mx-auto h-auto w-full max-w-64 rounded-lg border border-[var(--border)] shadow-sm"
          />
        </div>
      </section>

      {/* Said on the front page rather than hidden in the pricing table: the
          cloud sells operation, not access to the software. */}
      <section
        className="mt-10 rounded border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="self-host"
      >
        <h2 id="self-host" className="text-xl font-semibold tracking-tight">
          {t('selfHostTitle')}
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] text-[var(--fg-muted)]">{t('selfHostBody')}</p>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] underline underline-offset-2"
        >
          <Github aria-hidden className="size-4" />
          {t('selfHostCta')}
        </a>
      </section>
    </SiteShell>
  )
}
