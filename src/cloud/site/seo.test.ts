import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { edition } from '@/server/edition'
import { LOCALES } from '@/i18n/config'
import { SITE_PAGES, SITE_PRIMARY_LOCALE, pathFor } from './routes'
import { faqPage, itemList, softwareApplication } from './structured-data'

/**
 * What a search engine is told, asserted where it is cheap to assert.
 *
 * Everything in here fails in the same way: correctly, silently, and only in
 * a search console six weeks later. There is nothing on the page to look at,
 * nobody files a bug, and the first symptom is a ranking that never arrives.
 */

const ORIGIN = 'https://goodworkshop.example'

/**
 * Both of these routes exist in both editions and answer differently, because
 * Next resolves `sitemap.xml` and `robots.txt` by file name and will not find
 * them under a `*.cloud.ts` one. The suite runs as a community build, so the
 * cloud's answers are reached by saying which edition is being asked about.
 */
vi.mock('@/server/edition', () => ({ edition: { name: 'cloud' } }))

/**
 * Two methods, one of them published in only two languages.
 *
 * The partial one is the point: the sitemap has to offer two addresses for it
 * and annotate exactly those two, not four. A fixture where everything is
 * translated would pass whatever the code did.
 */
vi.mock('@gw/catalog', () => ({
  catalog: {
    publishedMethodSlugs: async () => [
      { id: 'm1', locale: 'en', slug: 'dot-voting' },
      { id: 'm1', locale: 'de', slug: 'punktabfrage' },
      { id: 'm1', locale: 'fr', slug: 'vote-par-gommettes' },
      { id: 'm1', locale: 'es', slug: 'votacion-con-puntos' },
      { id: 'm2', locale: 'en', slug: 'check-in' },
      { id: 'm2', locale: 'de', slug: 'check-in' },
    ],
  },
}))

/** 4 addresses for the complete method, 2 for the partial one. */
const METHOD_ENTRIES = 6

/** The other half of the switch, for the two tests that assert on it. */
const asCommunity = () => {
  ;(edition as { name: string }).name = 'community'
}

beforeEach(() => {
  // Absolute URLs come from GW_APP_URL rather than the request -- see
  // src/cloud/site/metadata.ts for why.
  vi.stubEnv('GW_APP_URL', ORIGIN)
  ;(edition as { name: string }).name = 'cloud'
})

describe('the sitemap', () => {
  it('offers every page in every language', async () => {
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toHaveLength(SITE_PAGES.length * LOCALES.length + METHOD_ENTRIES)
    for (const page of SITE_PAGES) {
      for (const locale of LOCALES) {
        expect(urls).toContain(`${ORIGIN}${pathFor(page, locale)}`)
      }
    }
  })

  it('gives absolute URLs on the configured origin', async () => {
    // A relative URL in a sitemap is not merely ignored -- the file is
    // rejected, and with it every page in it.
    for (const { url } of await sitemap()) {
      expect(url.startsWith(`${ORIGIN}/`), url).toBe(true)
    }
  })

  it('repeats the whole set of alternates on every entry, itself included', async () => {
    // hreflang is a mutual claim: an annotation that the page it points at
    // does not return for itself is discarded, and so is the whole set. That
    // holds for every entry, however many languages it has.
    for (const entry of await sitemap()) {
      expect(Object.values(entry.alternates?.languages ?? {}), entry.url).toContain(entry.url)
    }
  })

  it('names all four languages for a page, and only the published ones for a method', async () => {
    // The difference is the point. A page exists in four languages by
    // construction; a method is published per language, and offering four
    // addresses for one that has two would be two promises that answer 404.
    const entries = await sitemap()
    const page = entries.find((entry) => entry.url === `${ORIGIN}/pricing`)
    expect(Object.keys(page?.alternates?.languages ?? {}).sort()).toEqual(
      [...LOCALES, 'x-default'].sort(),
    )

    const partial = entries.find((entry) => entry.url.endsWith('/workshop-methods/check-in'))
    expect(Object.keys(partial?.alternates?.languages ?? {}).sort()).toEqual([
      'de',
      'en',
      'x-default',
    ])
  })

  it('points x-default at the unprefixed page', async () => {
    for (const entry of await sitemap()) {
      expect(entry.alternates?.languages?.['x-default']).toBe(
        entry.alternates?.languages?.[SITE_PRIMARY_LOCALE],
      )
    }
  })
})

describe('robots.txt', () => {
  const rule = () => {
    const [first] = [robots().rules].flat()
    return first!
  }

  it('names the sitemap, absolutely', () => {
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`)
  })

  it('keeps crawlers out of what needs a session or a token', () => {
    // Not a secret -- a crawler gets a redirect from all of these. It is a
    // question of crawl budget, and of /s/<token>, which is somebody's agenda.
    const disallow = [rule().disallow].flat()
    for (const path of ['/library', '/discover', '/w/', '/s/', '/api/', '/print/', '/login']) {
      expect(disallow, path).toContain(path)
    }
  })

  it('lets them into every page that is meant to rank', () => {
    const disallow = [rule().disallow].flat().filter((path) => typeof path === 'string')
    for (const page of SITE_PAGES) {
      for (const locale of LOCALES) {
        const path = pathFor(page, locale)
        const blocked = disallow.find((prefix) => path.startsWith(prefix))
        expect(blocked, `${path} is blocked by ${blocked}`).toBeUndefined()
      }
    }
  })
})

describe('a self-hosted installation', () => {
  it('invites no crawler at all', () => {
    // Every address it has answers with a redirect to a login. Saying so
    // costs one line and spares the operator a log full of fetches.
    asCommunity()
    const [rule] = [robots().rules].flat()
    expect(rule?.disallow).toBe('/')
    expect(rule?.allow).toBeUndefined()
    expect(robots().sitemap).toBeUndefined()
  })

  it('publishes no sitemap', async () => {
    asCommunity()
    expect(await sitemap()).toEqual([])
  })
})

describe('the unprefixed routes on disk', () => {
  /**
   * The one thing the route table cannot check about itself.
   *
   * English has no prefix, so each of its pages is a directory under
   * src/app/(site) -- or, for the front page, src/app/page.tsx. Rename a slug
   * in the table without renaming the directory and the canonical, the
   * sitemap and every internal link point at a 404, while the old address
   * keeps serving the page perfectly.
   */
  const site = join(import.meta.dirname, '../../app/(site)')

  it('has a directory for every unprefixed slug', () => {
    for (const page of SITE_PAGES) {
      const path = pathFor(page, SITE_PRIMARY_LOCALE)
      if (path === '/') continue
      const file = join(site, path.slice(1), 'page.cloud.tsx')
      expect(existsSync(file), `${path} has no route at ${file}`).toBe(true)
    }
  })

  it('has no page directory the table does not know', () => {
    // A page nothing links to and the sitemap does not offer: it will be found
    // eventually, and then it competes with the page that was meant to rank.
    const known = new Set([
      ...SITE_PAGES.map((page) => pathFor(page, SITE_PRIMARY_LOCALE).slice(1)),
      // The prefixed routes, and the registration flow, which is deliberately
      // outside the table -- see its generateMetadata.
      '[lang]',
      'registrieren',
    ])
    const found = readdirSync(site, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    expect(found.filter((name) => !known.has(name))).toEqual([])
  })
})

describe('structured data', () => {
  it('leaves the price out when there is no price to state', () => {
    // The pricing page shows a dash when the accounting system does not
    // answer. Markup naming a number the page does not is the one thing
    // schema.org must never do.
    const data = softwareApplication({ locale: 'de', name: 'GoodWorkshop', description: 'x' })
    expect(data).not.toHaveProperty('offers')
  })

  it('states net prices as net', () => {
    const data = softwareApplication({
      locale: 'de',
      name: 'GoodWorkshop',
      description: 'x',
      offers: [{ price: 5, unit: 'per member' }],
    })
    const [offer] = (data as { offers: { price: string; valueAddedTaxIncluded: boolean }[] }).offers
    expect(offer?.price).toBe('5.00')
    expect(offer?.valueAddedTaxIncluded).toBe(false)
  })

  it('carries every question the page prints, and only those', () => {
    const entries = [{ question: 'a', answer: 'b' }]
    expect(faqPage(entries).mainEntity).toHaveLength(1)
    expect(faqPage(entries).mainEntity[0]?.acceptedAnswer.text).toBe('b')
  })

  it('numbers a list from one, the way schema.org counts', () => {
    const list = itemList('x', [{ name: 'a' }, { name: 'b' }])
    expect(list.itemListElement.map((item) => item.position)).toEqual([1, 2])
    expect(list.numberOfItems).toBe(2)
  })
})
