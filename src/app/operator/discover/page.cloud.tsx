import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listCatalogEntries, listCatalogFacets } from '@/cloud/operator/catalog'
import { currentOperator } from '@/cloud/operator/session'
import { LOCALES } from '@/i18n/config'
import { FacetForm } from './facet-form'

/**
 * What is in the Discover catalogue, and how much of it is translated.
 *
 * The most useful read for a one-person operator is not "what exists" but
 * "what is missing", so the language column is the point of the table rather
 * than an afterthought.
 */
export const dynamic = 'force-dynamic'

/**
 * The English name, or the key when nobody has written one yet.
 *
 * The key is what everything else points at and the name is what the thing
 * IS -- a list of keys tells you how many entries exist and nothing about
 * what they are, which is the wrong half for somebody asking what is in the
 * library.
 *
 * One lookup, where there used to be two chained fallbacks: a method's text
 * was nested one level deeper than a design's, and every reader carried the
 * difference around. One sort of entry, one shape.
 */
const nameOf = (text: Partial<Record<string, { fields?: Record<string, string> }>>, key: string) =>
  text['en']?.fields?.['name'] ?? key

export default async function OperatorDiscover() {
  const operator = await currentOperator()
  if (!operator) redirect('/operator/login' as never)

  const [t, entries, facets] = await Promise.all([
    getTranslations('operator.discover'),
    listCatalogEntries(operatorDb()),
    listCatalogFacets(operatorDb()),
  ])

  return (
    <div>
      <Link
        href={'/operator' as Route}
        className="text-[14px] text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('backToTenants')}
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{t('title')}</h1>

      <section className="mt-6" aria-labelledby="entries">
        <h2 id="entries" className="text-[17px] font-medium">
          {t('entries')}
        </h2>
        <p className="mt-1 max-w-2xl text-[14px] text-[var(--fg-subtle)]">{t('blocksViaMcp')}</p>
        {entries.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                <Link
                  href={`/operator/discover/e/${entry.id}` as Route}
                  className="min-h-11 flex-1 content-center text-[15px] underline-offset-2 hover:underline"
                >
                  {nameOf(entry.text, entry.key)}
                  <span className="ml-2 text-[13px] text-[var(--fg-subtle)]">{entry.key}</span>
                </Link>
                <span className="text-[14px] text-[var(--fg-subtle)] tabular-nums">
                  {t('dayCount', { count: entry.days.length })}
                </span>
                {/* Which languages are live, as letters rather than a count:
                    "en de" says what is missing, "2/4" only says how much. */}
                <span className="text-[14px] tabular-nums">
                  {LOCALES.filter((locale) => entry.text[locale]?.published).join(' ') ||
                    t('draft')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="filters">
        <h2 id="filters" className="text-[17px] font-medium">
          {t('filters')}
        </h2>
        <ul className="mt-3 space-y-3">
          {facets.map((group) => (
            <li key={group.key}>
              <h3 className="text-[15px] font-medium">{group.key}</h3>
              <p className="mt-1 flex flex-wrap gap-2">
                {group.values.map((value) => (
                  <span
                    key={value.id}
                    className={`rounded-full border px-2 py-0.5 text-[13px] ${
                      value.retired
                        ? 'border-[var(--border)] text-[var(--fg-subtle)] line-through'
                        : 'border-[var(--border-strong)]'
                    }`}
                  >
                    {value.key}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <FacetForm groups={facets.map((group) => group.key)} />
      </section>
    </div>
  )
}
