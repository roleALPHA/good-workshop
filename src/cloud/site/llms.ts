/*
 * The text of /llms.txt. The route in src/app/llms.txt explains what it is for;
 * it lives here because a route file may export nothing but its handlers.
 */

import { LOCALES, type Locale } from '@/i18n/config'
import { catalog } from '@gw/catalog'
import { siteUrl } from '@/cloud/site/metadata'
import { SOURCE_URL } from '@/lib/attribution'
import { pathFor, SITE_PRIMARY_LOCALE, type SitePage } from '@/cloud/site/routes'
import en from '@/messages/en.json'

/** The pages worth a model's attention, in the order it should read them. */
const PAGES: SitePage[] = ['home', 'compare', 'pricing', 'methods', 'faq']

const LANGUAGE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
}

export async function llmsTxt(): Promise<string> {
  const meta = en.site.meta
  const compare = en.site.compare

  const pages = PAGES.map(
    (page) =>
      `- [${meta[page].title}](${siteUrl(pathFor(page, SITE_PRIMARY_LOCALE))}): ${meta[page].description}`,
  )

  const languages = LOCALES.filter((locale) => locale !== SITE_PRIMARY_LOCALE).map(
    (locale) => `- [${LANGUAGE_NAMES[locale]}](${siteUrl(pathFor('home', locale))})`,
  )

  /**
   * The size of the library, not the library itself.
   *
   * Listing every method was the first shape of this file, and against the real
   * catalogue it came to 41 KB of link lines -- the opposite of what llmstxt.org
   * is for, which is the short overview a model reads before it decides where to
   * look. It also had to invent the names: the slug is not the title, and
   * `1-2-4-all` came out as "1 2 4 all".
   *
   * One sentence with the count carries the fact that matters ("there are 500 of
   * these") and costs one query. The methods themselves are in the sitemap,
   * which is what a crawler reads, and behind the overview page linked above.
   */
  const published = (await catalog.publishedEntrySlugs()).filter(
    (entry) => entry.locale === SITE_PRIMARY_LOCALE,
  ).length

  const differences = (['selfHost', 'ai', 'data', 'pricing', 'room'] as const).map(
    (key) => `- ${compare[key].title}: ${compare[key].body}`,
  )

  return [
    '# GoodWorkshop',
    '',
    `> ${meta.home.description}`,
    '',
    ...differences,
    '',
    '## Pages',
    '',
    ...pages,
    '',
    '## Other languages',
    '',
    ...languages,
    '',
    ...(published > 0
      ? [
          '## Workshop methods',
          '',
          `${published} method ${published === 1 ? 'page' : 'pages'}, each with a summary, a step-by-step and the group size it suits.`,
          `Index: ${siteUrl(pathFor('methods', SITE_PRIMARY_LOCALE))} — every page is in the sitemap.`,
          '',
        ]
      : []),
    '## Optional',
    '',
    `- [Source code](${SOURCE_URL}): free to run on your own server, commercial use included.`,
    '',
  ].join('\n')
}
