import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { isFiltered, queryFromParams, type SearchParams } from '@/cloud/catalog/query'
import type { Locale } from '@/i18n/config'
import { DiscoverFilters } from './filters'
import { EntryList } from './entry-list'
import { entryView } from './entry-view'

/**
 * Discover: the curated catalogue, and the way into an entry.
 *
 * Under `(app)`, so the session gate in its layout has already run -- a route
 * added here is protected because of where it sits. `.cloud.tsx`, so a
 * community build does not have it at all: the catalogue is curated by whoever
 * runs the cloud, and a self-hosted installation has nobody to curate it.
 *
 * ONE LIST, AND NOT A SORT FILTER OVER IT. There used to be methods and
 * designs, and briefly a pair of tabs between them. There is one sort of entry
 * now, so the question "which sort" has no answer to give: somebody with ninety
 * minutes filters by time and gets what fits, whether that is a building block
 * or a short programme.
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

      {/* No filters to offer when the vocabulary is empty, which is what an
          unconfigured catalogue looks like. Rendering the heading and nothing
          under it would be a control that does nothing. */}
      {facets.length > 0 && <DiscoverFilters facets={facets} params={params} query={query} />}

      {page.items.length === 0 ? (
        <Empty filtered={isFiltered(query)} />
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
 * Why there is nothing, said precisely.
 *
 * Two situations and not one. "Nothing here yet" in front of a library that
 * holds fifteen entries -- because a filter excluded all of them -- is how
 * somebody concludes the feature is broken.
 */
async function Empty({ filtered }: { filtered: boolean }) {
  const t = await getTranslations('discover')
  return (
    <Card title={filtered ? t('noMatchTitle') : t('emptyTitle')}>
      <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
        {filtered ? t('noMatchBody') : t('emptyBody')}
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
