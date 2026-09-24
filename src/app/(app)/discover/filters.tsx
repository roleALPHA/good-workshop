import Link from 'next/link'
import type { Route } from 'next'
import { getTranslations } from 'next-intl/server'
import type { CatalogQuery, Facet } from '@/cloud/catalog/ports'
import {
  CLEARED,
  RESERVED,
  isFiltered,
  toggleFacet,
  type SearchParams,
} from '@/cloud/catalog/query'

/** The reserved names this form renders a control for, so they are not doubled. */
const FORM_FIELDS: readonly string[] = ['group', 'time', 'q']

/**
 * The filters, as links and a plain form.
 *
 * No 'use client', no onChange: this is the same choice the language switcher
 * on the login page makes, and for a stronger reason here. Every control is an
 * address, so the whole screen works before hydration, the browser's back
 * button walks the filters, and a filtered list is something you can send
 * somebody. A checkbox that posts through JavaScript would have none of that
 * and would look identical.
 *
 * The vocabulary comes from the catalogue, so this component renders a filter
 * it has never seen: `single` decides radio-ish behaviour versus a set of
 * toggles, and nothing here knows what "inclusivity" means.
 */
export async function DiscoverFilters({
  facets,
  params,
  query,
}: {
  facets: Facet[]
  params: SearchParams
  query: CatalogQuery
}) {
  const t = await getTranslations('discover')
  const chosen = (kind: string) => new Set(query.facets?.[kind] ?? [])

  return (
    <section aria-labelledby="discover-filters" className="mt-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h2 id="discover-filters" className="text-[15px] font-medium">
          {t('filtersLabel')}
        </h2>
        {isFiltered(query) && (
          <Link
            href={CLEARED as Route}
            className="text-[14px] text-[var(--fg-muted)] underline underline-offset-2"
          >
            {t('clear')}
          </Link>
        )}
      </div>

      {facets.map((facet) => (
        <div key={facet.kind} className="mt-4">
          <h3 className="text-[14px] text-[var(--fg-subtle)]">{facet.label}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {facet.values.map((value) => {
              const on = chosen(facet.kind).has(value.key)
              return (
                <li key={value.key}>
                  <Link
                    href={toggleFacet(params, facet.kind, value.key) as Route}
                    // The state is in the text and the border, never in colour
                    // alone -- docs/ui-conventions.md, and the reason a chip
                    // that is merely tinted is unreadable to a third of people.
                    aria-pressed={on}
                    className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[15px] ${
                      on
                        ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]'
                        : 'border-[var(--border-strong)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    {on ? `✓ ${value.label}` : value.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {/* A GET form, so the two numbers and the search box end up in the
          address exactly like the chips above. Submitting replaces the WHOLE
          query string, which is why everything not inside the form is repeated
          as a hidden field: the chips, and the reserved parameters this form
          has no control for. Leaving `kind` out meant that typing a search term
          while looking at the methods quietly put the designs back. The cursor
          is the one thing deliberately dropped -- page three of the old filter
          is not page three of the new one. */}
      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        {Object.entries(params)
          .filter(
            ([key]) =>
              facets.some((facet) => facet.kind === key) ||
              (RESERVED.includes(key) && !FORM_FIELDS.includes(key) && key !== 'after'),
          )
          .map(([key, value]) => (
            <input
              key={key}
              type="hidden"
              name={key}
              value={Array.isArray(value) ? (value[0] ?? '') : (value ?? '')}
            />
          ))}

        <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
          {t('groupSizeLabel')}
          <input
            type="number"
            name="group"
            min={1}
            max={10000}
            inputMode="numeric"
            defaultValue={query.groupSize ?? ''}
            placeholder={t('groupSizeHint')}
            // 16px, or iOS zooms the page on focus -- ui-conventions.md.
            className="min-h-11 w-44 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[16px]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
          {t('timeLabel')}
          <input
            type="number"
            name="time"
            min={1}
            step={15}
            inputMode="numeric"
            defaultValue={query.maxMinutes ?? ''}
            className="min-h-11 w-40 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[16px]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
          {t('searchLabel')}
          <input
            type="search"
            name="q"
            defaultValue={query.search ?? ''}
            className="min-h-11 w-56 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[16px]"
          />
        </label>

        <button
          type="submit"
          className="min-h-11 rounded border border-[var(--border-strong)] px-4 text-[15px] hover:bg-[var(--surface-raised)]"
        >
          {t('apply')}
        </button>
      </form>
    </section>
  )
}
