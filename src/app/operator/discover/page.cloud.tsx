import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listCatalogDesigns, listCatalogFacets, listCatalogMethods } from '@/cloud/operator/catalog'
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

type Method = {
  id: string
  key: string
  moduleTypeKey: string
  text: Record<string, { published?: boolean; slug?: string | null }>
}
type Design = { id: string; key: string; published: boolean; days: unknown[] }
type FacetGroup = {
  key: string
  values: { id: string; key: string; retired: boolean; text: Record<string, unknown> }[]
}

export default async function OperatorDiscover() {
  const operator = await currentOperator()
  if (!operator) redirect('/operator/login' as never)

  const [t, methods, designs, facets] = await Promise.all([
    getTranslations('operator.discover'),
    listCatalogMethods(operatorDb()) as Promise<Method[]>,
    listCatalogDesigns(operatorDb()) as Promise<Design[]>,
    listCatalogFacets(operatorDb()) as Promise<FacetGroup[]>,
  ])

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>

      <section className="mt-6" aria-labelledby="methods">
        <h2 id="methods" className="text-[17px] font-medium">
          {t('methods')}
        </h2>
        {methods.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
            {methods.map((method) => (
              <li key={method.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                <Link
                  href={`/operator/discover/m/${method.id}` as Route}
                  className="min-h-11 flex-1 content-center text-[15px] underline-offset-2 hover:underline"
                >
                  {method.key}
                </Link>
                <span className="text-[14px] text-[var(--fg-subtle)]">{method.moduleTypeKey}</span>
                {/* Which languages are live, as letters rather than a count:
                    "en de" says what is missing, "2/4" only says how much. */}
                <span className="text-[14px] tabular-nums">
                  {LOCALES.filter((locale) => method.text[locale]?.published).join(' ') ||
                    t('draft')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="designs">
        <h2 id="designs" className="text-[17px] font-medium">
          {t('designs')}
        </h2>
        <p className="mt-1 max-w-2xl text-[14px] text-[var(--fg-subtle)]">{t('designsViaMcp')}</p>
        {designs.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
            {designs.map((design) => (
              <li key={design.id} className="flex flex-wrap items-center gap-x-4 p-3">
                <span className="flex-1 text-[15px]">{design.key}</span>
                <span className="text-[14px] text-[var(--fg-subtle)] tabular-nums">
                  {design.days.length}
                </span>
                <span className="text-[14px]">
                  {design.published ? t('published') : t('draft')}
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
