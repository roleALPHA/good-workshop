import type { Locale } from '@/i18n/config'

/**
 * What Discover needs from the catalogue, and nothing about where it is kept.
 *
 * The curated methods and designs, their four language versions and the
 * vocabulary they are filtered by live in the private repository: they are the
 * commercial asset, and they are authored at runtime rather than released. This
 * repository holds the contract, everything that reads through it -- the
 * screens, the routes, the MCP tools -- and an implementation that answers
 * "empty" (./unavailable.ts).
 *
 * WHY "EMPTY" AND NOT "REFUSE". The billing port next door throws
 * BillingUnavailableError from every method, because an invoice nobody can
 * issue is a failure worth stopping on. A catalogue with nothing in it is not:
 * it is what a fresh installation legitimately looks like, and the screens have
 * to render it anyway on the day before the first method is written. So the
 * unavailable implementation is indistinguishable from an empty catalogue, and
 * `configured` exists for the one thing that genuinely differs -- whether to
 * offer the entry points at all.
 *
 * WHAT IS DELIBERATELY NOT HERE: adopting a design. That writes into somebody's
 * workshops through the collaboration room, which is the most dangerous code
 * path in this feature, and it belongs where `pnpm test:db` and the E2E suite
 * reach it. The port says *what* is adopted; src/cloud/catalog/adopt.ts decides
 * *how* it is written.
 */

/** One page of results, and the cursor that asks for the next one. */
export type Page<T> = {
  items: T[]
  /** Null when this was the last page. Opaque: only the catalogue reads it. */
  nextCursor: string | null
}

/**
 * A value one of the filters offers, in the reader's language.
 *
 * `key` is what a URL carries and never changes; `label` is translated and may.
 * Both travel together so a filter chip can be rendered from one object.
 */
export type FacetValue = { key: string; label: string }

/**
 * One filter, with the values it currently has.
 *
 * `kind` is a row in the catalogue rather than a union here, because a fourth
 * question has to be askable without a release -- that is the whole point of
 * keeping the vocabulary in the database. `single` tells the UI whether to
 * render a select or a set of checkboxes without knowing what it is rendering.
 */
export type Facet = {
  kind: string
  label: string
  single: boolean
  values: FacetValue[]
}

/** What both lists are narrowed by. Empty means "everything published". */
export type CatalogQuery = {
  locale: Locale
  /**
   * Facet kind to the value keys asked for. Every chosen value is a
   * requirement.
   *
   * AND throughout, including within one kind, because that is what the
   * question actually means: "works seated" plus "needs no reading" asks for
   * something that is both, not something that is either. A kind that allows
   * only one choice cannot tell the difference, so one rule covers both.
   */
  facets?: Record<string, string[]>
  /** The number of people in the room; matches designs whose range covers it. */
  groupSize?: number
  /** The time available, in minutes. Matches what fits inside it. */
  maxMinutes?: number
  search?: string
  cursor?: string | null
  limit?: number
}

/**
 * What a row in a list shows.
 *
 * One shape, because there is only one sort of entry. It used to be two --
 * `MethodSummary` with a slug and `DesignSummary` with a day count -- on the
 * belief that a method is a single block and a design a whole workshop. Open
 * Space and an RTSC conference run for days and are methods by any reading, and
 * once adopting became a copy rather than a reference, nothing structural was
 * left between them. What remains is a property: an entry with a slug has a
 * public page, an entry without one is seen only behind a session.
 */
export type EntrySummary = {
  id: string
  name: string
  summary: string
  /**
   * False when this language has no translation and the text above is English.
   * Shown to the reader rather than hidden -- the same choice the legal pages
   * make with `site.legal.notTranslated`.
   */
  translated: boolean
  facets: FacetValue[]
  minParticipants: number | null
  maxParticipants: number | null
  /** What the entry is advertised at, not the sum of its blocks. Authored. */
  durationMinutes: number
  /** Always at least one. A single day is what a building block looks like. */
  dayCount: number
  /**
   * The public address in the reader's language, or null.
   *
   * Null is the ordinary case and not a gap: most of the catalogue is read
   * behind a session, and only an entry somebody decided to publish to the
   * open web carries one. A slug is unique per LANGUAGE
   * (`catalog_text_slug_unique`), which is why the signed-in screens address an
   * entry by id -- the language there comes from the person rather than from
   * the path, so the same address would open a different entry for a colleague
   * reading in another language.
   */
  slug: string | null
}

/**
 * A block of an entry, in the shape the adopter writes it.
 *
 * Close to `BlockFields` in src/server/mcp/tools.ts on purpose: both describe
 * "a block somebody is about to create", and the adopter hands these to the
 * same `addModuleBlock` the MCP tools use.
 */
export type EntryBlock = {
  kind: 'module'
  /** Resolved against the TARGET tenant's module_type by key, never by id. */
  moduleTypeKey: string
  title: string
  durationMinutes: number
  pinnedStartMinute: number | null
  parked: boolean
  /** The block's type-specific description, as Markdown. Converted on the way in. */
  description: string
  /**
   * What the adopted block starts with in its type-specific fields.
   *
   * The reason this rebuild happened: a block type has `prompt`, `materials`,
   * `participation`, `timebox_per_person_seconds` and the rest, and the
   * catalogue had nowhere to put them. Validated against the ADOPTING tenant's
   * `module_type.json_schema` and not here -- a workspace may have customised
   * the type, and fields its schema refuses arrive empty and counted rather
   * than failing the whole adoption.
   */
  fields: Record<string, unknown>
}

export type EntryCluster = {
  kind: 'cluster'
  title: string
  /** A token from the curated palette, never a hex value. */
  color: string | null
  pinnedStartMinute: number | null
  children: EntryBlock[]
}

export type EntryDay = {
  title: string
  /**
   * The minute of day this day is written to start at.
   *
   * Carried onto the new workshop_day rather than inherited from the host
   * workshop: pins resolve against their own day's start, so borrowing another
   * day's start would shift every unpinned block while the pins stayed put.
   */
  startMinute: number
  items: (EntryBlock | EntryCluster)[]
}

export type EntryDetail = EntrySummary & {
  /** The long prose of a public entry. Markdown; rendered, never trusted as HTML. */
  body: string
  /** One or more. The day is the grouping; an entry without days has none. */
  days: EntryDay[]
}

export type CatalogPort = {
  /**
   * Whether this build has a catalogue at all.
   *
   * The screens render an empty catalogue perfectly well, so this is not about
   * failing gracefully. It is about not offering a door into a room that does
   * not exist: the header link and the "start from an entry" choice are hidden
   * when it is false.
   */
  readonly configured: boolean

  listFacets(locale: Locale): Promise<Facet[]>

  /**
   * The catalogue, newest first.
   *
   * One list and one query. It was briefly a `union all` across two tables,
   * back when a method and a design were different things -- and the cursor was
   * the reason that could not simply be two queries merged in the reader: a
   * cursor names a position in ONE ordering, so paging two lists separately
   * would repeat a row or skip one at every page boundary.
   */
  listEntries(query: CatalogQuery): Promise<Page<EntrySummary>>

  /**
   * One entry by id, for the screens behind a session.
   *
   * By id and never by slug, because a slug is unique per LANGUAGE: the same
   * address would open a different entry for a colleague reading in another
   * language, with a 200 and nothing to notice it by. It also answers for an
   * entry this language has no translation of, falling back to English with
   * `translated: false`.
   */
  getEntry(id: string, locale: Locale): Promise<EntryDetail | null>

  /**
   * One entry by its public address, for the open web.
   *
   * The language is part of the path there, so slug and language together are
   * unambiguous. Unpublished, withdrawn, or published in another language are
   * all "not here": a soft 404 is how an index fills with addresses that were
   * never real.
   */
  getEntryBySlug(slug: string, locale: Locale): Promise<EntryDetail | null>

  /**
   * Every published address, by entry and language.
   *
   * Per language and not one list, because publication is per language: an
   * entry that exists only in English has one address, not four. Naming a
   * French URL that answers 404 -- or worse, answers in English -- is the
   * duplicate the whole routing scheme exists to avoid.
   *
   * `id` is what makes this answer two questions with one query: the sitemap
   * groups by it to emit one entry per address, and an entry page groups by it
   * to name the languages it is actually published in.
   */
  publishedEntrySlugs(): Promise<{ id: string; locale: Locale; slug: string }[]>
}
