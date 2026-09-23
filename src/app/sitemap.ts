import type { MetadataRoute } from 'next'
import { edition } from '@/server/edition'
import { LOCALES } from '@/i18n/config'
import { catalog } from '@gw/catalog'
import { siteUrl } from '@/cloud/site/metadata'
import {
  SITE_PAGES,
  alternatesFor,
  alternatesForMethod,
  methodPathFor,
  pathFor,
  type SitePage,
} from '@/cloud/site/routes'
import type { Locale } from '@/i18n/config'

/**
 * Every public page, in every language, from the one table that knows them.
 *
 * Empty in a community build, and that is the honest answer rather than a
 * missing file: a self-hosted installation is entirely behind a login and has
 * no public page to offer. It cannot be a `*.cloud.ts` route the way the pages
 * are -- Next resolves `sitemap.xml` by file name and does not find it under
 * one -- so the edition is checked here instead, through the same build-time
 * alias everything else uses.
 *
 * Dynamic rather than generated at build time. The absolute URLs come from
 * GW_APP_URL, and the image is built once and run by whoever runs it; baking
 * the build machine's idea of the hostname into the sitemap is exactly the
 * kind of mistake that is invisible until a search console reports every URL
 * as unreachable.
 *
 * No `lastModified`. A date that is really "whenever this container started"
 * is worse than none: a crawler that learns the field is meaningless stops
 * reading it, including on the day it would have mattered.
 */
export const dynamic = 'force-dynamic'

/**
 * What a page is worth relative to the others on this site -- nothing more.
 * The front page and the three pages somebody actually searches for lead; the
 * legal texts are there to be found by name, not to rank.
 */
const PRIORITY: Record<SitePage, number> = {
  home: 1,
  pricing: 0.8,
  methods: 0.8,
  compare: 0.8,
  faq: 0.7,
  impressum: 0.3,
  agb: 0.3,
  datenschutz: 0.3,
  avv: 0.3,
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (edition.name !== 'cloud') return []

  return [...pages(), ...(await methods())]
}

function pages(): MetadataRoute.Sitemap {
  return SITE_PAGES.flatMap((page) => {
    const { languages, xDefault } = alternatesFor(page)
    // Each of the four entries repeats the whole set, itself included. That is
    // not redundancy -- an hreflang annotation that a page does not return for
    // itself is ignored, and the sitemap is one of the three places Google
    // accepts the annotation at all.
    const alternates = {
      languages: {
        ...Object.fromEntries(LOCALES.map((locale) => [locale, siteUrl(languages[locale])])),
        'x-default': siteUrl(xDefault),
      },
    }
    return LOCALES.map((locale) => ({
      url: siteUrl(pathFor(page, locale)),
      priority: PRIORITY[page],
      alternates,
    }))
  })
}

/**
 * One entry per method per language it is published in -- not per language.
 *
 * Publication is per language here, unlike every page above: a method written
 * only in English has one address. Offering four would be four promises, three
 * of which answer 404, and a crawler that finds them stops believing the file.
 *
 * Below the directory's own priority, because a directory is what somebody
 * browsing wants and a method page is what somebody searching wants. Both are
 * worth having; only one of them is the way in.
 */
async function methods(): Promise<MetadataRoute.Sitemap> {
  const published = await catalog.publishedMethodSlugs()

  const byMethod = new Map<string, Partial<Record<Locale, string>>>()
  for (const entry of published) {
    byMethod.set(entry.id, { ...byMethod.get(entry.id), [entry.locale]: entry.slug })
  }

  return published.map((entry) => {
    const { languages, xDefault } = alternatesForMethod(byMethod.get(entry.id) ?? {})
    return {
      url: siteUrl(methodPathFor(entry.slug, entry.locale)),
      priority: 0.6,
      alternates: {
        languages: {
          ...Object.fromEntries(
            Object.entries(languages).map(([locale, path]) => [locale, siteUrl(path)]),
          ),
          ...(xDefault ? { 'x-default': siteUrl(xDefault) } : {}),
        },
      },
    }
  })
}
