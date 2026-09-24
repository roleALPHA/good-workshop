import type pg from 'pg'
import { LOCALES, type Locale } from '@/i18n/config'

/**
 * The Discover catalogue, written from the console.
 *
 * Every call is one `app.op_catalog_*` function: gw_operator has no table
 * grant, and that is the console's whole authorisation model rather than an
 * inconvenience to work around. The functions validate everything again --
 * this file is the first line, they are the last, and they are the one that
 * holds when somebody reaches for psql.
 *
 * Whole documents, not fields. A method or a design is saved in one call for
 * the reason apply_agenda exists: a half-written entry is worse than an
 * unwritten one, and reconciling twenty edits against a tree two levels deep
 * is how half a design ends up in the database.
 */

type Db = Pick<pg.Pool, 'query'>

/** The fields an entity carries per language. Free-form, because entities differ. */
export type LocalisedText = Partial<Record<Locale, Record<string, string>>>

/**
 * What the console and the MCP write. One draft, because there is one sort of
 * entry -- see ../catalog/ports.ts for why that collapsed.
 */
export type EntryDraft = {
  key: string
  /** What the entry is advertised at, not the sum of its blocks. */
  durationMinutes: number
  /** A Postgres int4range, e.g. `[8,21)`. Empty means any size. */
  groupSize?: string
  /** Absent leaves the tags alone; present replaces them wholesale. */
  facets?: string[]
  /** Per language: `name`, `summary`, `body`, and `slug` for a public page. */
  text: LocalisedText
}

export type DayDraft = {
  ordinal: number
  startMinute?: number
  text?: LocalisedText
  blocks: BlockDraft[]
}

export type BlockDraft = {
  ordinal: number
  kind: 'cluster' | 'module'
  /** The cluster this block sits in, named by ITS ordinal on the same day. */
  parentOrdinal?: number
  /**
   * Modules only, and by key -- a block type, not a method.
   *
   * It used to name a method, and that reference is precisely what made a
   * method a single block. Ids are not a thing anybody types correctly, and a
   * module_type id would belong to one tenant anyway.
   */
  moduleTypeKey?: string
  durationMinutes?: number
  pinnedStartMinute?: number
  parked?: boolean
  color?: string
  /** What the adopted block starts with in its type-specific fields. */
  fields?: Record<string, unknown>
  text?: LocalisedText
}

/**
 * What a read gives back, named once.
 *
 * It used to be `unknown[]`, and every caller declared the shape again -- the
 * list page, the editor page and the form each had their own copy, three
 * places for one JSON document to drift apart in. The function in the database
 * decides this shape; naming it here is the nearest a TypeScript file gets to
 * saying so.
 */
export type EntryRow = {
  id: string
  key: string
  durationMinutes: number
  groupSize: string
  facets: string[]
  /** Per language: the address, whether it is live, and the prose. */
  text: Partial<
    Record<Locale, { slug: string | null; published: boolean; fields: Record<string, string> }>
  >
  days: {
    ordinal: number
    startMinute: number
    text: Partial<Record<Locale, Record<string, string>>>
    blocks: (BlockDraft & { fields: Record<string, unknown> })[]
  }[]
}

export type FacetGroupRow = {
  id: string
  key: string
  cardinality: 'one' | 'many'
  sortOrder: number
  retired: boolean
  text: Partial<Record<Locale, Record<string, string>>>
  values: {
    id: string
    key: string
    sortOrder: number
    retired: boolean
    text: Partial<Record<Locale, Record<string, string>>>
  }[]
}

async function read(db: Db, kind: 'entries' | 'facets', id?: string) {
  const { rows } = await db.query('select app.op_catalog_read($1, $2) as data', [kind, id ?? null])
  return rows[0].data as unknown[]
}

export const listCatalogEntries = (db: Db, id?: string) =>
  read(db, 'entries', id) as Promise<EntryRow[]>
export const listCatalogFacets = (db: Db) => read(db, 'facets') as Promise<FacetGroupRow[]>

export async function saveCatalogEntry(
  db: Db,
  operatorId: string,
  draft: EntryDraft,
): Promise<string> {
  const { rows } = await db.query('select app.op_catalog_save_entry($1, $2) as id', [
    operatorId,
    JSON.stringify(draft),
  ])
  return rows[0].id as string
}

/**
 * Every day of an entry with its blocks, in one call -- the catalogue's
 * apply_agenda. Replaces what is there.
 */
export async function setCatalogBlocks(
  db: Db,
  operatorId: string,
  entryId: string,
  days: DayDraft[],
): Promise<void> {
  await db.query('select app.op_catalog_set_blocks($1, $2, $3)', [
    operatorId,
    entryId,
    JSON.stringify(days),
  ])
}

/**
 * Making something live, or taking it back -- per language.
 *
 * The locales are defaulted rather than refused when empty: the caller is
 * saying "publish this", and which languages that means is not their question
 * to get wrong.
 */
export async function setCatalogStatus(
  db: Db,
  operatorId: string,
  id: string,
  locales: Locale[],
  published: boolean,
): Promise<void> {
  await db.query('select app.op_catalog_set_status($1, $2, $3, $4)', [
    operatorId,
    id,
    locales.length > 0 ? locales : [...LOCALES],
    published,
  ])
}

export async function saveCatalogFacet(
  db: Db,
  operatorId: string,
  draft: { group: string; key: string; sortOrder?: number; text: LocalisedText },
): Promise<string> {
  const { rows } = await db.query('select app.op_catalog_save_facet($1, $2) as id', [
    operatorId,
    JSON.stringify(draft),
  ])
  return rows[0].id
}

export async function retireCatalogFacet(db: Db, operatorId: string, id: string): Promise<void> {
  await db.query('select app.op_catalog_retire_facet($1, $2)', [operatorId, id])
}
