import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/i18n/config'
import {
  SITE_PAGES,
  SITE_PRIMARY_LOCALE,
  alternatesFor,
  alternatesForMethod,
  methodPathFor,
  localeForPath,
  pageForPath,
  pathFor,
  type SitePage,
} from './routes'

/**
 * The address table of the public website.
 *
 * Everything downstream reads from it -- the sitemap, the hreflang block, the
 * canonical of every page, the navigation and the locale a request renders in.
 * A mistake here is therefore never local: a duplicated slug is two pages
 * competing for one search result, and a path that does not round-trip is a
 * canonical pointing at a 404.
 */

describe('the address of a page', () => {
  it('serves English without a prefix', () => {
    // The unprefixed address is the one that accumulates links, and the
    // competition for these search terms is in English.
    expect(SITE_PRIMARY_LOCALE).toBe('en')
    expect(pathFor('home', 'en')).toBe('/')
    expect(pathFor('pricing', 'en')).toBe('/pricing')
    expect(pathFor('methods', 'en')).toBe('/workshop-methods')
    expect(pathFor('impressum', 'en')).toBe('/imprint')
  })

  it('gives every other language a prefix and its own words', () => {
    // The slug is read by a person and by a search engine, so it is translated
    // rather than transliterated: /fr/tarifs, not /fr/pricing.
    expect(pathFor('home', 'de')).toBe('/de')
    expect(pathFor('pricing', 'de')).toBe('/de/preise')
    expect(pathFor('pricing', 'fr')).toBe('/fr/tarifs')
    expect(pathFor('pricing', 'es')).toBe('/es/precios')
  })

  it('never starts a path with anything but a slash, and never ends with one', () => {
    for (const page of SITE_PAGES) {
      for (const locale of LOCALES) {
        const path = pathFor(page, locale)
        // The English home page is the one legitimate bare slash; every other
        // address has something after it and nothing at the end of it.
        expect(path, `${page}/${locale}`).toMatch(/^\//u)
        expect(path === '/' || !path.endsWith('/'), `${page}/${locale} ends in a slash`).toBe(true)
      }
    }
  })

  it('uses a slug a search engine can read: lower case, no spaces, no umlauts', () => {
    for (const page of SITE_PAGES) {
      for (const locale of LOCALES) {
        expect(pathFor(page, locale), `${page}/${locale}`).toMatch(/^\/[a-z0-9/-]*$/u)
      }
    }
  })
})

describe('the table as a whole', () => {
  it('gives no two pages the same address', () => {
    // Two pages under one URL is the one mistake in here that cannot be seen
    // by looking at a page: one of them simply never renders.
    const seen = new Map<string, string>()
    for (const page of SITE_PAGES) {
      for (const locale of LOCALES) {
        const path = pathFor(page, locale)
        expect(seen.get(path), `${path} is both ${seen.get(path)} and ${page}`).toBeUndefined()
        seen.set(path, `${page}/${locale}`)
      }
    }
  })

  it('never uses a language code as an unprefixed slug', () => {
    // /de would be the German home page and the English page for "de" at
    // once, and the prefixed route would win.
    for (const page of SITE_PAGES) {
      const slug = pathFor(page, SITE_PRIMARY_LOCALE).slice(1)
      expect(LOCALES, `${page} is addressed /${slug}`).not.toContain(slug)
    }
  })
})

describe('reading a path back', () => {
  it('recognises every address the table produces', () => {
    for (const page of SITE_PAGES) {
      for (const locale of LOCALES) {
        expect(pageForPath(pathFor(page, locale))).toEqual({ page, locale })
      }
    }
  })

  it('tolerates a trailing slash, which is what a person types', () => {
    expect(pageForPath('/pricing/')).toEqual({ page: 'pricing', locale: 'en' })
    expect(pageForPath('/de/preise/')).toEqual({ page: 'pricing', locale: 'de' })
  })

  it('does not recognise the application behind the login', () => {
    // The decisive case: these paths must fall through, or a signed-in French
    // visitor reads their library in German.
    for (const path of ['/library', '/w/abc', '/settings/security', '/api/mcp', '/login']) {
      expect(pageForPath(path), path).toBeNull()
      expect(localeForPath(path), path).toBeNull()
    }
  })

  it('does not invent a page for an unknown slug', () => {
    expect(pageForPath('/de/nonsense')).toBeNull()
    expect(pageForPath('/nonsense')).toBeNull()
  })

  it('does not answer at the primary language own prefix', () => {
    // English is unprefixed, so /en is nothing. next.config.ts redirects it
    // to `/` rather than leaving somebody who typed it at a 404.
    expect(pageForPath('/en')).toBeNull()
    expect(pageForPath('/en/pricing')).toBeNull()
  })

  it('reads the language out of the address and nowhere else', () => {
    // This is what stops a cookie from serving German at /en/pricing -- a page
    // Google has indexed as English.
    expect(localeForPath('/de/preise')).toBe('de')
    expect(localeForPath('/fr')).toBe('fr')
    expect(localeForPath('/')).toBe('en')
    expect(localeForPath('/pricing')).toBe('en')
  })
})

describe('the alternates of a page', () => {
  it('name every language and point at the unprefixed one as the default', () => {
    const alternates = alternatesFor('pricing')
    expect(alternates.languages).toEqual({
      de: '/de/preise',
      en: '/pricing',
      fr: '/fr/tarifs',
      es: '/es/precios',
    })
    // x-default is what a visitor gets when no listed language fits.
    expect(alternates.xDefault).toBe('/pricing')
  })

  it('are complete for every page, because a one-sided hreflang is ignored', () => {
    for (const page of SITE_PAGES) {
      const { languages } = alternatesFor(page as SitePage)
      expect(Object.keys(languages).sort()).toEqual([...LOCALES].sort())
    }
  })
})

describe('one method below the directory', () => {
  it('is recognised in every language', () => {
    expect(pageForPath('/workshop-methods/dot-voting')).toEqual({
      page: 'methods',
      locale: 'en',
      detail: 'dot-voting',
    })
    expect(pageForPath('/de/workshop-methoden/punktabfrage')).toEqual({
      page: 'methods',
      locale: 'de',
      detail: 'punktabfrage',
    })
  })

  it('pins the language from the address, the way every other page does', () => {
    // The middleware reads this. Without it a method page would take its
    // language from a cookie and serve German at a French address.
    expect(localeForPath('/fr/methodes-d-animation/check-in')).toBe('fr')
    expect(localeForPath('/workshop-methods/check-in')).toBe('en')
  })

  it('exists only below the methods directory', () => {
    // Everything else keeps the flat shape it had, so a stray segment is still
    // nothing rather than a page that renders empty.
    expect(pageForPath('/pricing/anything')).toBeNull()
    expect(pageForPath('/de/preise/anything')).toBeNull()
    expect(pageForPath('/faq/anything')).toBeNull()
  })

  it('refuses an address that is not a slug, without asking anybody', () => {
    // Checked by shape, because src/middleware.ts imports this and runs on the
    // edge with no database. Whether the method EXISTS is the page's question.
    expect(pageForPath('/workshop-methods/Punkt_Abfrage')).toBeNull()
    expect(pageForPath('/workshop-methods/-leading')).toBeNull()
    expect(pageForPath('/workshop-methods/a/b')).toBeNull()
    expect(pageForPath('/de/workshop-methoden/a/b')).toBeNull()
  })

  it('builds the address it recognises', () => {
    expect(methodPathFor('dot-voting', 'en')).toBe('/workshop-methods/dot-voting')
    expect(methodPathFor('punktabfrage', 'de')).toBe('/de/workshop-methoden/punktabfrage')
    expect(pageForPath(methodPathFor('x-y', 'fr'))).toEqual({
      page: 'methods',
      locale: 'fr',
      detail: 'x-y',
    })
  })
})

describe('the alternates of one method', () => {
  it('name only the languages it is published in', () => {
    // A method that exists in two languages has two addresses. Naming four
    // would annotate two pages that answer 404, and a set with a member that
    // does not return it is dropped whole.
    const { languages, xDefault } = alternatesForMethod({ en: 'check-in', de: 'check-in' })
    expect(languages).toEqual({
      en: '/workshop-methods/check-in',
      de: '/de/workshop-methoden/check-in',
    })
    expect(xDefault).toBe('/workshop-methods/check-in')
  })

  it('has no default when the source language is not published', () => {
    // x-default is "what somebody gets whose language is none of these", and
    // that answer is the unprefixed one. Without it, there is none to give.
    const { languages, xDefault } = alternatesForMethod({ de: 'punktabfrage' })
    expect(languages).toEqual({ de: '/de/workshop-methoden/punktabfrage' })
    expect(xDefault).toBeNull()
  })
})
