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

export type MethodDraft = {
  key: string
  moduleTypeKey: string
  defaultDurationMinutes: number
  /** A Postgres int4range, e.g. `[8,21)`. Empty means any size. */
  groupSize?: string
  facets?: string[]
  /** Per language: `name`, `summary`, `body`, and `slug` for the public page. */
  text: LocalisedText
}

export type DesignDraft = {
  key: string
  durationMinutes: number
  groupSize?: string
  facets?: string[]
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
  /** Modules only, and by key -- ids are not a thing anybody types correctly. */
  methodKey?: string
  durationMinutes?: number
  pinnedStartMinute?: number
  parked?: boolean
  color?: string
  text?: LocalisedText
}

async function read(db: Db, kind: 'methods' | 'designs' | 'facets', id?: string) {
  const { rows } = await db.query('select app.op_catalog_read($1, $2) as data', [kind, id ?? null])
  return rows[0].data as unknown[]
}

export const listCatalogMethods = (db: Db, id?: string) => read(db, 'methods', id)
export const listCatalogDesigns = (db: Db, id?: string) => read(db, 'designs', id)
export const listCatalogFacets = (db: Db) => read(db, 'facets')

export async function saveCatalogMethod(
  db: Db,
  operatorId: string,
  draft: MethodDraft,
): Promise<string> {
  const { rows } = await db.query('select app.op_catalog_save_method($1, $2) as id', [
    operatorId,
    JSON.stringify(draft),
  ])
  return rows[0].id
}

export async function saveCatalogDesign(
  db: Db,
  operatorId: string,
  draft: DesignDraft,
): Promise<string> {
  const { rows } = await db.query('select app.op_catalog_save_design($1, $2) as id', [
    operatorId,
    JSON.stringify(draft),
  ])
  return rows[0].id
}

export async function setCatalogDays(
  db: Db,
  operatorId: string,
  designId: string,
  days: DayDraft[],
): Promise<void> {
  await db.query('select app.op_catalog_set_days($1, $2, $3)', [
    operatorId,
    designId,
    JSON.stringify(days),
  ])
}

/**
 * Making something live, or taking it back.
 *
 * A method publishes per language -- each is its own public address -- and a
 * design publishes once, because it has none. The locales are ignored for a
 * design rather than refused: the caller is saying "publish this", and which
 * languages that means is not their question to get wrong.
 */
export async function setCatalogStatus(
  db: Db,
  operatorId: string,
  kind: 'method' | 'design',
  id: string,
  locales: Locale[],
  published: boolean,
): Promise<void> {
  await db.query('select app.op_catalog_set_status($1, $2, $3, $4, $5)', [
    operatorId,
    kind,
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
