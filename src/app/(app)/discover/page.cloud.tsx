import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { formatDuration } from '@/features/agenda/duration'
import { isFiltered, queryFromParams, type SearchParams } from '@/cloud/catalog/query'
import type { DesignSummary } from '@/cloud/catalog/ports'
import type { Locale } from '@/i18n/config'
import { DiscoverFilters } from './filters'
import { People } from './people'

/**
 * Discover: the curated designs, and the way into one.
 *
 * Under `(app)`, so the session gate in its layout has already run -- a route
 * added here is protected because of where it sits. `.cloud.tsx`, so a
 * community build does not have it at all: the catalogue is curated by whoever
 * runs the cloud, and a self-hosted installation has nobody to curate it.
 *
 * Everything is rendered on the server and every filter is an address; see
 * ./filters.tsx for why that is worth the plainness.
 */
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('discover')
  return { title: t('title') }
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [params, t, locale] = await Promise.all([
    searchParams,
    getTranslations('discover'),
    getLocale() as Promise<Locale>,
  ])

  const facets = await catalog.listFacets(locale)
  const query = queryFromParams(params, locale, facets)
  const page = await catalog.listDesigns({ ...query, limit: PAGE_SIZE })

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-[var(--fg-muted)]">{t('lead')}</p>

      {/* No filters to offer when the vocabulary is empty, which is what an
          unconfigured catalogue looks like. Rendering the heading and nothing
          under it would be a control that does nothing. */}
      {facets.length > 0 && <DiscoverFilters facets={facets} params={params} query={query} />}

      {page.items.length === 0 ? (
        <section className="mt-10 max-w-xl rounded border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-[17px] font-medium">
            {isFiltered(query) ? t('noMatchTitle') : t('emptyTitle')}
          </h2>
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
            {isFiltered(query) ? t('noMatchBody') : t('emptyBody')}
          </p>
        </section>
      ) : (
        <ul className="mt-8 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
          {page.items.map((design) => (
            <DesignRow key={design.id} design={design} untranslated={t('untranslated')} />
          ))}
        </ul>
      )}

      {page.nextCursor && (
        <p className="mt-6">
          <Link
            href={
              `?${new URLSearchParams({ ...asStrings(params), after: page.nextCursor })}` as Route
            }
            className="inline-flex min-h-11 items-center rounded border border-[var(--border-strong)] px-4 text-[15px] hover:bg-[var(--surface-raised)]"
          >
            {t('more')}
          </Link>
        </p>
      )}
    </div>
  )
}

/** `searchParams` may hand back arrays; the "load more" link carries the first of each. */
function asStrings(params: SearchParams): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .map(([key, value]) => [key, Array.isArray(value) ? (value[0] ?? '') : (value ?? '')])
      .filter(([, value]) => value !== ''),
  )
}

async function DesignRow({
  design,
  untranslated,
}: {
  design: DesignSummary
  untranslated: string
}) {
  const t = await getTranslations('discover')

  return (
    <li className="p-4">
      {/* Addressed by id: a design has no slug, on purpose -- see ports.ts. */}
      <Link
        href={`/discover/${design.id}` as Route}
        className="text-[17px] font-medium underline-offset-2 hover:underline"
      >
        {design.name}
      </Link>
      <p className="mt-1 max-w-2xl text-[15px] text-[var(--fg-muted)]">{design.summary}</p>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
        {/* tabular-nums, so a column of durations lines up -- ui-conventions.md */}
        <span className="tabular-nums">{t('days', { count: design.dayCount })}</span>
        <span className="tabular-nums">
          {formatDuration(design.durationMinutes, { spaced: true })}
        </span>
        <span>
          <People range={design} />
        </span>
      </p>

      {design.facets.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-2">
          {design.facets.map((facet) => (
            <span
              key={`${facet.key}-${facet.label}`}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[13px] text-[var(--fg-muted)]"
            >
              {facet.label}
            </span>
          ))}
        </p>
      )}

      {/* Said rather than hidden: the same choice the legal pages make when a
          translation is missing. */}
      {!design.translated && (
        <p className="mt-2 text-[13px] text-[var(--fg-subtle)]">{untranslated}</p>
      )}
    </li>
  )
}
