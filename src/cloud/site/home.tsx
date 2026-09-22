import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Bot, Github, Printer, Share2, Timer, Users } from 'lucide-react'
import { readSessionCached } from '@/server/auth/session'
import { SOURCE_URL } from '@/lib/attribution'
import type { Locale } from '@/i18n/config'
import { siteMetadata } from './metadata'
import { pathFor } from './routes'
import { JsonLd, softwareApplication } from './structured-data'
import { SiteShell } from './site-shell'

/**
 * The cloud's front page. Somebody already signed in has no use for a sales
 * page and goes straight to their library.
 *
 * The default export carries the shell because it answers `/` through
 * src/app/page.tsx, which sits outside the `(site)` group and therefore
 * outside the layout that would otherwise provide it. `<Home>` is the same
 * page without it, for the prefixed routes under `(site)/[lang]`, where the
 * layout does -- two shells nested inside each other would render the
 * navigation and the legal footer twice.
 */
/** Re-exported by src/app/page.tsx, which answers `/`. */
export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata('home')
}

export default async function CloudHome() {
  await sendMembersToTheirLibrary()
  return (
    <SiteShell>
      <Home />
    </SiteShell>
  )
}

/** Shared by every language's front page; see the note above. */
export async function sendMembersToTheirLibrary() {
  if (await readSessionCached().catch(() => null)) redirect('/library')
}

export async function Home() {
  const [t, nav, locale] = await Promise.all([
    getTranslations('site.home'),
    getTranslations('site.nav'),
    getLocale() as Promise<Locale>,
  ])

  const features = [
    ['plan', Timer],
    ['together', Users],
    ['ai', Bot],
    ['share', Share2],
    ['print', Printer],
  ] as const

  /**
   * The three pages worth reading next, linked from the page every link
   * points at. Internal links are how a crawler finds a page at all -- the
   * sitemap offers them, a link is what makes them look worth fetching.
   */
  const more = [
    ['methods', pathFor('methods', locale), nav('methods'), t('moreMethods')],
    ['faq', pathFor('faq', locale), nav('faq'), t('moreFaq')],
    ['compare', pathFor('compare', locale), nav('compare'), t('moreCompare')],
  ] as const

  return (
    <>
      {/* No `offers`: the prices come out of the accounting system and are
          read on the pricing page. Naming one here would be a price this page
          does not show, which is the one thing schema.org markup must not do. */}
      <JsonLd
        data={softwareApplication({
          locale,
          name: 'GoodWorkshop',
          description: t('lead'),
        })}
      />

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
            href={pathFor('pricing', locale) as Route}
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

      <section className="mt-10" aria-labelledby="more">
        <h2 id="more" className="text-xl font-semibold tracking-tight">
          {t('moreTitle')}
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {more.map(([key, href, label, body]) => (
            <li key={key}>
              <Link
                href={href as Route}
                className="block h-full rounded border border-[var(--border)] p-4 hover:bg-[var(--surface-raised)]"
              >
                <span className="text-[16px] font-medium underline underline-offset-2">
                  {label}
                </span>
                <span className="mt-1 block text-[15px] text-[var(--fg-muted)]">{body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
