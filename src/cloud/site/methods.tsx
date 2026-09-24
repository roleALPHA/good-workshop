import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { formatDuration } from '@/features/agenda/duration'
import type { Locale } from '@/i18n/config'
import { methodPathFor, pathFor } from './routes'
import { breadcrumb, itemList, JsonLd } from './structured-data'

/**
 * The methods directory, read from the catalogue.
 *
 * It used to be fifteen hardcoded keys with their prose in
 * `site.methods.entries.*` -- the same fifteen names the product already had
 * as block types in builtins.json, written twice. structured-data.tsx states
 * the rule this closes: "every value comes from the same source the page
 * renders from, never a second copy."
 *
 * This page exists because of how people look for a workshop planner: almost
 * nobody searches for one. They search for "check-in method", "how long does
 * group work take", "energizer after lunch" -- and a tool with nothing to say
 * about those is never in the answer.
 *
 * An empty catalogue renders an empty page rather than an error. That is a
 * real state, on the day before the first method is written and on any build
 * without the private repository.
 */
export async function Methods() {
  const [t, nav, locale] = await Promise.all([
    getTranslations('site.methods'),
    getTranslations('site.nav'),
    getLocale() as Promise<Locale>,
  ])

  // Everything published in this language that has a public address. A
  // directory that paged would hide half of a list somebody came here to scan.
  //
  // `slug` is the filter, and it is the whole rule: an entry the catalogue
  // published without an address is readable behind a session and has no page
  // out here. Most of the catalogue is that.
  const page = await catalog.listEntries({ locale, limit: 100 })
  const items = page.items.filter((entry) => entry.slug !== null)

  return (
    <div>
      {items.length > 0 && (
        <JsonLd
          data={itemList(
            t('title'),
            items.map((entry) => ({
              name: entry.name,
              description: entry.summary,
              url: methodPathFor(entry.slug!, locale),
            })),
          )}
        />
      )}
      <JsonLd data={breadcrumb('methods', locale, t('title'), nav('home'))} />

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
      <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-[var(--fg-muted)]">
        {t('lead')}
      </p>

      {items.length === 0 ? (
        <section className="mt-10 max-w-xl rounded border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-[17px] font-medium">{t('emptyTitle')}</h2>
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('emptyBody')}</p>
        </section>
      ) : (
        /* A list, not a grid: these are read one after another, and somebody
           arriving from a search for one of them lands on its heading. */
        <ul className="mt-10 max-w-3xl">
          {items.map((entry) => (
            <li key={entry.id} className="border-t border-[var(--border)] py-6">
              <h2 className="text-xl font-semibold tracking-tight">
                <Link
                  href={methodPathFor(entry.slug!, locale) as Route}
                  className="underline-offset-2 hover:underline"
                >
                  {entry.name}
                </Link>
              </h2>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
                <div className="flex gap-2">
                  <dt>{t('durationLabel')}:</dt>
                  <dd className="text-[var(--fg-muted)] tabular-nums">
                    {formatDuration(entry.durationMinutes, { spaced: true })}
                  </dd>
                </div>
                {entry.facets.map((facet) => (
                  <div key={facet.key} className="flex gap-2">
                    <dt className="sr-only">{t('socialLabel')}</dt>
                    <dd className="text-[var(--fg-muted)]">{facet.label}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[16px] leading-relaxed text-[var(--fg-muted)]">
                {entry.summary}
              </p>
            </li>
          ))}
        </ul>
      )}

      <section
        className="mt-10 max-w-3xl border-t border-[var(--border)] pt-8"
        aria-labelledby="how"
      >
        <h2 id="how" className="text-xl font-semibold tracking-tight">
          {t('howTitle')}
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--fg-muted)]">{t('howBody')}</p>
      </section>

      <section
        className="mt-10 max-w-3xl rounded border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="methods-cta"
      >
        <h2 id="methods-cta" className="text-xl font-semibold tracking-tight">
          {t('ctaTitle')}
        </h2>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('ctaBody')}</p>
        <Link
          href={'/registrieren' as Route}
          className="mt-4 inline-flex min-h-11 items-center rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
        >
          {t('cta')}
        </Link>
        <p className="mt-3 text-[14px]">
          <Link href={pathFor('faq', locale) as Route} className="underline underline-offset-2">
            {nav('faq')}
          </Link>
        </p>
      </section>
    </div>
  )
}
