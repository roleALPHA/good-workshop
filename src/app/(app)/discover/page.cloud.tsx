import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { isFiltered, kindHref, queryFromParams, type SearchParams } from '@/cloud/catalog/query'
import type { EntryKind } from '@/cloud/catalog/ports'
import type { Locale } from '@/i18n/config'
import { DiscoverFilters } from './filters'
import { EntryList } from './entry-list'
import { entryView } from './entry-view'

/**
 * Discover: the curated designs and the methods they are built from, and the
 * way into either.
 *
 * Under `(app)`, so the session gate in its layout has already run -- a route
 * added here is protected because of where it sits. `.cloud.tsx`, so a
 * community build does not have it at all: the catalogue is curated by whoever
 * runs the cloud, and a self-hosted installation has nobody to curate it.
 *
 * ONE LIST, TAGGED, AND NOT TWO TABS. A method is not a lesser design; it is
 * what a design is made of, and somebody looking for "something for forty
 * minutes with a group of twelve" wants both answers ranked together. The kind
 * is therefore a way to narrow the one list, not a pair of separate screens --
 * and it travels in the address like every other filter.
 *
 * Everything that decides what is in the list is rendered on the server. Only
 * the paging is an island; see ./entry-list.tsx.
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
  const page = await catalog.listEntries({ ...query, limit: PAGE_SIZE })

  // Every row is worded here, on the server. The island is handed strings and
  // nothing else: a label FUNCTION cannot cross into a client component, and
  // React only says so at request time -- see ./entry-view.ts.
  const items = page.items.map((entry) => entryView(entry, t))

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-[var(--fg-muted)]">{t('lead')}</p>

      <KindTabs params={params} chosen={query.kind ?? null} />

      {/* No filters to offer when the vocabulary is empty, which is what an
          unconfigured catalogue looks like. Rendering the heading and nothing
          under it would be a control that does nothing. */}
      {facets.length > 0 && <DiscoverFilters facets={facets} params={params} query={query} />}

      {page.items.length === 0 ? (
        <Empty filtered={isFiltered(query)} kind={query.kind ?? null} params={params} />
      ) : (
        <EntryList
          // The address is part of the identity: React would otherwise reuse
          // the island and keep the previous filter's rows in state while the
          // props change underneath it.
          key={addressOf(params)}
          initial={items}
          initialCursor={page.nextCursor}
          params={params}
          labels={{ more: t('more'), loading: t('loading'), failed: t('loadFailed') }}
        />
      )}
    </div>
  )
}

/** Everything that changes what is in the list, as one string. */
function addressOf(params: SearchParams): string {
  return Object.entries(params)
    .filter(([key]) => key !== 'after')
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : (value ?? '')}`)
    .sort()
    .join('&')
}

/**
 * All / Designs / Methods, as three links.
 *
 * Above the filters rather than among them, and not counted by `isFiltered`:
 * this is a choice of what to look at, and if "clear the filters" reset it too,
 * dropping a facet would silently put the designs back.
 */
async function KindTabs({ params, chosen }: { params: SearchParams; chosen: EntryKind | null }) {
  const t = await getTranslations('discover')
  const tabs: { kind: EntryKind | null; label: string }[] = [
    { kind: null, label: t('kindAll') },
    { kind: 'design', label: t('kindDesigns') },
    { kind: 'method', label: t('kindMethods') },
  ]

  return (
    <nav aria-label={t('kindLabel')} className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const on = tab.kind === chosen
          return (
            <li key={tab.kind ?? 'all'}>
              <Link
                href={kindHref(params, tab.kind) as Route}
                aria-current={on ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] ${
                  on
                    ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]'
                    : 'border-[var(--border-strong)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Why there is nothing, said precisely.
 *
 * Four different situations, and telling them apart is the whole value of this
 * box. "Nothing here yet" in front of a library that holds fifteen methods --
 * because the reader is looking at the designs, and there are none -- is how
 * somebody concludes the feature is broken.
 */
async function Empty({
  filtered,
  kind,
  params,
}: {
  filtered: boolean
  kind: EntryKind | null
  params: SearchParams
}) {
  const t = await getTranslations('discover')

  if (filtered) {
    return (
      <Card title={t('noMatchTitle')}>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('noMatchBody')}</p>
      </Card>
    )
  }

  if (kind === 'design') {
    return (
      <Card title={t('emptyDesignsTitle')}>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
          {t('emptyDesignsBody')}{' '}
          <Link href={kindHref(params, 'method') as Route} className="underline underline-offset-2">
            {t('emptyDesignsLink')}
          </Link>
        </p>
      </Card>
    )
  }

  return (
    <Card title={kind === 'method' ? t('emptyMethodsTitle') : t('emptyTitle')}>
      <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
        {kind === 'method' ? t('emptyMethodsBody') : t('emptyBody')}
      </p>
    </Card>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 max-w-xl rounded border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-[17px] font-medium">{title}</h2>
      {children}
    </section>
  )
}
