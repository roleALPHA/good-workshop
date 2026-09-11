import { describe, expect, it } from 'vitest'
import { DOMAIN_ERROR_KEYS } from '@/domain/errors'
import { FIELD_ERROR_KEYS } from '@/domain/moduleType/validate'
import { SCOPES } from '@/domain/tenant/tokens'
import { WORKSHOP_STATUSES } from '@/domain/workshop/repo'
import { CATALOGS } from './catalogs'
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config'
import { icuShape } from './icu'

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

    /**
     * An empty string is only a fault where the German source has something to
     * say. Several built-in block types legitimately carry no description --
     * "Pause" needs none -- and an empty German source means an empty
     * translation is correct, not missing.
     */
    it('is never empty where German has text', () => {
      const blank = [...target.entries()]
        .filter(([key, value]) => value.trim() === '' && (source.get(key) ?? '').trim() !== '')
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
          const a = [...icuShape(german).args].sort()
          const b = [...icuShape(translated).args].sort()
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
      const required = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
      const incomplete: string[] = []

      for (const [key, message] of target) {
        const germanPlurals = icuShape(source.get(key) ?? '').plurals
        if (germanPlurals.size === 0) continue

        const declared = icuShape(message).plurals
        for (const argument of germanPlurals.keys()) {
          const categories = declared.get(argument)
          if (!categories || required.some((category) => !categories.has(category))) {
            incomplete.push(`${key} (${argument})`)
          }
        }
      }

      expect(incomplete).toEqual([])
    })
  })
})

/**
 * Key parity keeps the four catalogs equal to each other. This keeps them equal
 * to the CODE -- a domain error whose key nobody translated renders as the key
 * itself, in production, at the exact moment somebody hit the failure.
 *
 * Reads the runtime lists rather than the TypeScript unions, which is why those
 * are `as const` arrays: a union cannot be iterated at half past four on a
 * Friday, and a check nobody can run is not a check.
 */
describe('every key the code can throw', () => {
  describe.each(LOCALES)('%s', (locale: Locale) => {
    const catalog = flatten(CATALOGS[locale])

    it('has a sentence for every domain error', () => {
      const missing = DOMAIN_ERROR_KEYS.filter((key) => !catalog.has(`errors.domain.${key}`))
      expect(missing).toEqual([])
    })

    it('has a sentence for every field error', () => {
      const missing = FIELD_ERROR_KEYS.filter((key) => !catalog.has(`errors.field.${key}`))
      expect(missing).toEqual([])
    })

    /**
     * Enum values come out of the database as machine keys and are looked up by
     * value. A missing one renders as the key path -- "enums.tokenScope.tenant:read"
     * in a checkbox label -- which is the kind of thing that ships.
     */
    it('has a label for every token scope', () => {
      const missing = SCOPES.filter((scope) => !catalog.has(`enums.tokenScope.${scope}`))
      expect(missing).toEqual([])
    })

    it('has a label for every workshop status', () => {
      const missing = WORKSHOP_STATUSES.filter(
        (status) => !catalog.has(`enums.workshopStatus.${status}`),
      )
      expect(missing).toEqual([])
    })
  })
})
