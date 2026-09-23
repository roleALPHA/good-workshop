import type { CatalogPort } from './ports'

/**
 * What `@gw/catalog` resolves to unless the private build replaces it: a
 * catalogue with nothing in it.
 *
 * Empty rather than refusing, and the difference from ./../billing/adapters/
 * unavailable.ts next door is deliberate. An invoice nobody can issue is a
 * failure that must stop; a catalogue nobody has written yet is a Tuesday. The
 * screens have to render that state anyway -- on the day before the first
 * method is authored, and again whenever a filter matches nothing -- so making
 * it throw would buy an error path that exists only in builds without the
 * private repository, which is precisely where nobody would see it.
 *
 * `configured` is the one thing that genuinely differs, and it is used for one
 * thing: whether to offer the entry points into Discover at all. A door into an
 * empty room is worse than no door.
 */
const empty = async () => ({ items: [], nextCursor: null })

export const catalog: CatalogPort = {
  configured: false,
  listFacets: async () => [],
  listMethods: empty,
  getMethod: async () => null,
  listDesigns: empty,
  getDesign: async () => null,
  publishedMethodSlugs: async () => [],
}
