import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { authConfig } from '@/server/auth/config'
import { LOCALES, type Locale } from '@/i18n/config'
import { catalog } from '@gw/catalog'
import { alternatesFor, alternatesForMethod, methodPathFor, pathFor, type SitePage } from './routes'

/**
 * The head of every page of the public website, built in one place.
 *
 * Three things have to be right at once and each of them fails silently:
 *
 *  - the canonical, or four translations compete as duplicates of each other;
 *  - the hreflang set, which is only honoured when every page in it names
 *    every other page AND itself -- a one-sided annotation is discarded whole;
 *  - an absolute origin, because a relative canonical is not one.
 *
 * `getLocale()` rather than a parameter: src/middleware.ts has already pinned
 * the language to the address for every path in the route table, so asking is
 * the same answer as passing it and cannot drift from what the page renders.
 */

/** Open Graph wants a territory; the catalogs are languages. One place to bridge. */
const OG_LOCALES: Record<Locale, string> = {
  de: 'de_DE',
  en: 'en_US',
  fr: 'fr_FR',
  es: 'es_ES',
}

/**
 * Absolute, and from GW_APP_URL rather than from the request.
 *
 * The same reason /api/auth/logout and the share invites take it from there:
 * behind a reverse proxy the request's own host is whatever the proxy passed
 * on, and a canonical that names an internal hostname tells a search engine
 * the page lives somewhere nobody can reach.
 */
export function siteUrl(path: string): string {
  return new URL(path, authConfig.origin).toString()
}

export async function siteMetadata(page: SitePage): Promise<Metadata> {
  const [locale, t] = await Promise.all([
    getLocale() as Promise<Locale>,
    getTranslations('site.meta'),
  ])
  const { languages, xDefault } = alternatesFor(page)
  const canonical = pathFor(page, locale)
  const title = t(`${page}.title`)
  const description = t(`${page}.description`)

  return {
    title: page === 'home' ? { absolute: title } : title,
    description,
    alternates: {
      canonical,
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [l, languages[l]])),
        // The page for a visitor whose language is none of the four: the
        // unprefixed one, which is English.
        'x-default': xDefault,
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'GoodWorkshop',
      title,
      description,
      url: siteUrl(canonical),
      locale: OG_LOCALES[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
      images: [
        {
          // The screenshot the page itself shows, in the reader's language --
          // taken from the running application by e2e/marketing.capture.ts, so
          // the preview card is the product rather than a drawing of it.
          url: `/marketing/${locale}/agenda.png`,
          width: 1280,
          height: 860,
          alt: t('shareImageAlt'),
        },
      ],
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

/**
 * The head of one method's page.
 *
 * Its hreflang set names only the languages the method is actually published
 * in, which is why it cannot reuse `siteMetadata`: that one speaks for pages
 * that exist in all four by construction. A method published only in English
 * has one address, and annotating three that answer 404 would have the whole
 * set discarded.
 */
export async function methodMetadata(slug: string): Promise<Metadata> {
  const [locale, all] = await Promise.all([
    getLocale() as Promise<Locale>,
    catalog.publishedMethodSlugs(),
  ])
  const here = all.find((entry) => entry.slug === slug && entry.locale === locale)
  const method = await catalog.getMethod(slug, locale)
  // Nothing to describe. The page itself answers 404; emitting a title for it
  // would be a description of a page nobody can open.
  if (!here || !method) return {}

  const slugs = Object.fromEntries(
    all.filter((entry) => entry.id === here.id).map((entry) => [entry.locale, entry.slug]),
  ) as Partial<Record<Locale, string>>
  const { languages, xDefault } = alternatesForMethod(slugs)
  const canonical = methodPathFor(slug, locale)

  return {
    title: method.name,
    description: method.summary,
    alternates: {
      canonical,
      languages: { ...languages, ...(xDefault ? { 'x-default': xDefault } : {}) },
    },
    openGraph: {
      type: 'article',
      siteName: 'GoodWorkshop',
      title: method.name,
      description: method.summary,
      url: siteUrl(canonical),
      locale: OG_LOCALES[locale],
    },
    twitter: { card: 'summary_large_image', title: method.name, description: method.summary },
  }
}
