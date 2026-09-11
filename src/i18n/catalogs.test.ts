import { describe, expect, it } from 'vitest'
import { CATALOGS } from './catalogs'
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config'

/**
 * The guard that keeps four catalogs from drifting into three good ones and a
 * stale one.
 *
 * Key parity alone is not enough, and the two things it misses are exactly the
 * ones that survive review: a placeholder renamed during translation, and a
 * plural that is missing the category its language actually needs. Both render
 * without an error -- the first prints `{count}` at a facilitator, the second
 * silently picks the wrong form.
 */

type Flat = Map<string, string>

function flatten(value: unknown, prefix = '', into: Flat = new Map()): Flat {
  if (typeof value === 'string') {
    into.set(prefix, value)
    return into
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix === '' ? key : `${prefix}.${key}`, into)
    }
  }
  return into
}

/** `{count, plural, …}` and `{name}` alike -- the argument name is what matters. */
function placeholders(message: string): Set<string> {
  const names = new Set<string>()
  for (const match of message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)) {
    names.add(match[1]!)
  }
  return names
}

function pluralCategories(message: string): Set<string> {
  const names = new Set<string>()
  // The categories declared inside a `plural` block: `one {…}`, `other {…}`.
  const block = /\{\s*[a-zA-Z0-9_]+\s*,\s*plural\s*,([\s\S]*)\}/.exec(message)
  if (!block) return names
  for (const match of block[1]!.matchAll(/(?:^|\s)(zero|one|two|few|many|other)\s*\{/g)) {
    names.add(match[1]!)
  }
  return names
}

const source = flatten(CATALOGS[DEFAULT_LOCALE])
const translations = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

describe('message catalogs', () => {
  it('has something to check', () => {
    expect(source.size).toBeGreaterThan(0)
  })

  describe.each(translations)('%s', (locale: Locale) => {
    const target = flatten(CATALOGS[locale])

    it('has every key the German source has', () => {
      const missing = [...source.keys()].filter((key) => !target.has(key))
      expect(missing).toEqual([])
    })

    it('has no key the German source lacks', () => {
      const extra = [...target.keys()].filter((key) => !source.has(key))
      expect(extra).toEqual([])
    })

    it('is never empty where German has text', () => {
      const blank = [...target.entries()]
        .filter(([, value]) => value.trim() === '')
        .map(([key]) => key)
      expect(blank).toEqual([])
    })

    /**
     * The one that catches a French `{Count}` or a Spanish translation that
     * dropped `{max}` on the way through.
     */
    it('uses exactly the same ICU arguments as the German source', () => {
      const mismatched = [...source.entries()]
        .filter(([key, german]) => {
          const translated = target.get(key)
          if (translated === undefined) return false // already reported above
          const a = [...placeholders(german)].sort()
          const b = [...placeholders(translated)].sort()
          return a.join() !== b.join()
        })
        .map(([key]) => key)
      expect(mismatched).toEqual([])
    })

    /**
     * German needs `one`/`other`. French adds `many`, Spanish too. A plural
     * that declares only the German pair reads fine and is wrong.
     */
    it('declares every plural category its language requires', () => {
      const required = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories)
      const incomplete = [...target.entries()]
        .filter(([key, message]) => {
          if (!source.get(key)?.includes('plural')) return false
          const declared = pluralCategories(message)
          if (declared.size === 0) return true
          return [...required].some((category) => !declared.has(category))
        })
        .map(([key]) => key)
      expect(incomplete).toEqual([])
    })
  })
})
