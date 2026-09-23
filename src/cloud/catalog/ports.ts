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
  /** Facet kind to the value keys asked for. Values within a kind are OR, kinds are AND. */
  facets?: Record<string, string[]>
  /** The number of people in the room; matches designs whose range covers it. */
  groupSize?: number
  /** The time available, in minutes. Matches what fits inside it. */
  maxMinutes?: number
  search?: string
  cursor?: string | null
  limit?: number
}

/** Shared by the two summaries: what a row in a list shows. */
type CatalogSummary = {
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
}

/**
 * A method has a slug; a design does not.
 *
 * That asymmetry is the rule "a public method page never shows design details"
 * turned into a fact of the types. A method is published to the open web and
 * needs a readable address. A design is only ever seen behind a session, so it
 * is addressed by id -- and there is therefore no design URL in existence to
 * leak into a page, a sitemap or a link, whatever anybody writes later.
 */
export type MethodSummary = CatalogSummary & { slug: string; durationMinutes: number }

export type MethodDetail = MethodSummary & {
  /** The body, as Markdown. Rendered by the page; never trusted as HTML. */
  body: string
  /** The block type this method becomes in an agenda, BY KEY -- see adopt.ts. */
  moduleTypeKey: string
}

export type DesignSummary = CatalogSummary & {
  /** What the design is advertised at, not the sum of its blocks. See the plan. */
  durationMinutes: number
  dayCount: number
}

/**
 * A block of a design, in the shape the adopter writes it.
 *
 * Close to `BlockFields` in src/server/mcp/tools.ts on purpose: both describe
 * "a block somebody is about to create", and the adopter hands these to the
 * same `addModuleBlock` the MCP tools use.
 */
export type DesignBlock = {
  kind: 'module'
  /** Resolved against the TARGET tenant's module_type by key, never by id. */
  moduleTypeKey: string
  title: string
  durationMinutes: number
  pinnedStartMinute: number | null
  parked: boolean
  /** The block's type-specific description, as Markdown. Converted on the way in. */
  description: string
}

export type DesignCluster = {
  kind: 'cluster'
  title: string
  /** A token from the curated palette, never a hex value. */
  color: string | null
  pinnedStartMinute: number | null
  children: DesignBlock[]
}

export type DesignDay = {
  title: string
  /**
   * The minute of day this day is written to start at.
   *
   * Carried onto the new workshop_day rather than inherited from the host
   * workshop: pins resolve against their own day's start, so borrowing another
   * day's start would shift every unpinned block while the pins stayed put.
   */
  startMinute: number
  items: (DesignBlock | DesignCluster)[]
}

export type DesignDetail = DesignSummary & {
  body: string
  days: DesignDay[]
}

export type CatalogPort = {
  /**
   * Whether this build has a catalogue at all.
   *
   * The screens render an empty catalogue perfectly well, so this is not about
   * failing gracefully. It is about not offering a door into a room that does
   * not exist: the header link and the "start from a design" choice are hidden
   * when it is false.
   */
  readonly configured: boolean

  listFacets(locale: Locale): Promise<Facet[]>

  listMethods(query: CatalogQuery): Promise<Page<MethodSummary>>
  getMethod(slug: string, locale: Locale): Promise<MethodDetail | null>

  listDesigns(query: CatalogQuery): Promise<Page<DesignSummary>>
  getDesign(id: string, locale: Locale): Promise<DesignDetail | null>

  /**
   * Every published method's address, by method and language.
   *
   * Per language and not one list, because publication is per language: a
   * method that exists only in English has one address, not four. Naming a
   * French URL that answers 404 -- or worse, answers in English -- is the
   * duplicate the whole routing scheme exists to avoid.
   *
   * `id` is what makes this answer two questions with one query: the sitemap
   * groups by it to emit one entry per address, and a method page groups by it
   * to name the languages it is actually published in.
   */
  publishedMethodSlugs(): Promise<{ id: string; locale: Locale; slug: string }[]>
}
