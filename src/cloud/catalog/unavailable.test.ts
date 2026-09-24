import { describe, expect, it } from 'vitest'
import { catalog } from './unavailable'
import type { CatalogPort } from './ports'

/**
 * The catalogue a build without the private repository has.
 *
 * Worth asserting despite being four lines of implementation, because it is the
 * one the whole public repository is typechecked and tested against: every
 * screen, every route and every MCP tool sees this and nothing else. If it
 * threw, or answered `undefined`, that would show up only in a build nobody
 * runs -- which is the definition of a bug found late.
 */

describe('an unconfigured catalogue', () => {
  it('says so, which is the only thing that differs from an empty one', () => {
    // What this flag is for: whether to offer a door into Discover at all.
    // Everything else about an unconfigured catalogue and an empty one is
    // deliberately indistinguishable -- see the file comment there.
    expect(catalog.configured).toBe(false)
  })

  it('answers every read with nothing, rather than refusing', () => {
    // The deliberate difference from the billing adapters next door, which
    // throw. An empty library is a state the screens must render anyway.
    const locale = 'en' as const
    return Promise.all([
      expect(catalog.listFacets(locale)).resolves.toEqual([]),
      expect(catalog.listEntries({ locale })).resolves.toEqual({ items: [], nextCursor: null }),
      expect(catalog.getEntry('anything', locale)).resolves.toBeNull(),
      expect(catalog.getEntryBySlug('anything', locale)).resolves.toBeNull(),
      expect(catalog.publishedEntrySlugs()).resolves.toEqual([]),
    ])
  })

  it('implements the whole port, so the private one cannot quietly have less', () => {
    // The two implementations are reached through one alias and are never both
    // in a build. A method missing here is a method the public build never
    // calls and the private build might not have either.
    const required: (keyof CatalogPort)[] = [
      'configured',
      'listFacets',
      'listEntries',
      'getEntry',
      'getEntryBySlug',
      'publishedEntrySlugs',
    ]
    expect(Object.keys(catalog).sort()).toEqual([...required].sort())
  })
})
