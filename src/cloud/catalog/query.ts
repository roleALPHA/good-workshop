import type { Locale } from '@/i18n/config'
import type { CatalogQuery, Facet } from './ports'

/**
 * The filters, as they travel in the address bar.
 *
 * In the URL and not in component state, for the reason the library already
 * had to settle (src/app/(app)/library/search-box.tsx): a filtered list is a
 * place people link to and come back to, and the server does the filtering, so
 * the query has to reach it. Every filter control here is therefore an ordinary
 * `<a>` -- which also means the whole screen works before hydration, and that
 * a crawler could walk it if we ever let one.
 *
 * Pure on purpose: no next/navigation, no React. Parsing what a URL means is
 * the part that can be quietly wrong -- an unknown facet silently narrowing a
 * list to nothing, a stale value surviving a vocabulary change -- and it is
 * worth a table of tests rather than a click-through.
 */

/** What Next hands a page as `searchParams`. */
export type SearchParams = Record<string, string | string[] | undefined>

/** The reserved names, which are not facet kinds. */
const GROUP = 'group'
const TIME = 'time'
const SEARCH = 'q'
const CURSOR = 'after'
const RESERVED: readonly string[] = [GROUP, TIME, SEARCH, CURSOR]

/** Several values of one facet travel comma-separated: `?inclusivity=seated,no_reading`. */
const SEPARATOR = ','

/** First value wins; Next hands a repeated parameter as an array. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function values(param: string | string[] | undefined): string[] {
  const raw = one(param)
  if (!raw) return []
  return [
    ...new Set(
      raw
        .split(SEPARATOR)
        .map((v) => v.trim())
        .filter((v) => v !== ''),
    ),
  ]
}

/**
 * A whole number inside a range, or undefined.
 *
 * Undefined rather than a clamp for anything unusable: "12 people" and "as many
 * as you like" are different questions, and silently reading `?group=abc` as
 * "any" is the same answer as leaving it out -- which is what a person who
 * mistyped actually meant.
 */
function counted(param: string | string[] | undefined, max: number): number | undefined {
  const raw = one(param)
  if (raw === undefined || !/^\d{1,6}$/u.test(raw.trim())) return undefined
  const parsed = Number.parseInt(raw, 10)
  return parsed >= 1 && parsed <= max ? parsed : undefined
}

/** Wider than any workshop and narrow enough that nothing overflows downstream. */
const MAX_PEOPLE = 10_000
const MAX_MINUTES = 60 * 24 * 30

/**
 * What the address asks for, keeping only what the catalogue currently offers.
 *
 * `facets` is filtered against the live vocabulary, and that is the load-bearing
 * part: the vocabulary is authored at runtime, so an address bookmarked before
 * a value was retired would otherwise ask for something no design can carry and
 * quietly return nothing at all. Dropping the unknown value answers the rest of
 * the question instead.
 */
export function queryFromParams(
  params: SearchParams,
  locale: Locale,
  facets: Facet[],
): CatalogQuery {
  const known = new Map(
    facets.map((facet) => [facet.kind, new Set(facet.values.map((v) => v.key))]),
  )

  const chosen: Record<string, string[]> = {}
  for (const [kind, allowed] of known) {
    if (RESERVED.includes(kind)) continue
    const asked = values(params[kind]).filter((value) => allowed.has(value))
    if (asked.length > 0) chosen[kind] = asked
  }

  const search = one(params[SEARCH])?.trim()

  return {
    locale,
    ...(Object.keys(chosen).length > 0 ? { facets: chosen } : {}),
    ...(counted(params[GROUP], MAX_PEOPLE) !== undefined
      ? { groupSize: counted(params[GROUP], MAX_PEOPLE) }
      : {}),
    ...(counted(params[TIME], MAX_MINUTES) !== undefined
      ? { maxMinutes: counted(params[TIME], MAX_MINUTES) }
      : {}),
    ...(search ? { search } : {}),
    ...(one(params[CURSOR]) ? { cursor: one(params[CURSOR]) } : {}),
  }
}

/** Whether anything is narrowing the list, so the screen can offer to stop. */
export function isFiltered(query: CatalogQuery): boolean {
  return Boolean(query.facets || query.groupSize || query.maxMinutes || query.search)
}

/**
 * The address with one facet value turned on or off.
 *
 * Built from the parameters rather than from the parsed query, so that anything
 * this module does not understand -- a parameter a later version adds --
 * survives a click on a filter instead of being dropped by the trip through it.
 *
 * The cursor is always dropped: page three of the old filter is not page three
 * of the new one, and keeping it would show an empty page to somebody who just
 * narrowed a list.
 */
export function toggleFacet(params: SearchParams, kind: string, value: string): string {
  const current = values(params[kind])
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value].sort()
  return hrefFrom({ ...params, [kind]: next.join(SEPARATOR) })
}

/** Everything off. */
export const CLEARED = '?'

function hrefFrom(params: SearchParams): string {
  const search = new URLSearchParams()
  for (const [key, raw] of Object.entries(params)) {
    if (key === CURSOR) continue
    const value = one(raw)?.trim()
    if (value) search.set(key, value)
  }
  const query = search.toString()
  // A bare '?' rather than '' so the link is always an address of its own; an
  // empty href would mean "this page" to a browser and skip the navigation.
  return query === '' ? CLEARED : `?${query}`
}
