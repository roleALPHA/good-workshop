import { isLocale, LOCALES, type Locale } from '@/i18n/config'

/**
 * Every address the public website answers, in every language it speaks.
 *
 * One table, because six things have to agree about it and they are written in
 * six different places: the route files under `src/app/(site)`, the canonical
 * of each page, its hreflang block, the sitemap, the navigation, and the
 * language a request renders in. When those drift, nothing breaks loudly --
 * a canonical points at a 404, or two languages claim one URL, and the only
 * symptom is a page that quietly stops ranking.
 *
 * One language is served without a prefix, and it is English. That is a
 * market decision rather than a technical one: the competition for these
 * search terms is in English, and the unprefixed address is the one that
 * accumulates links. The German addresses that existed before this
 * (`/preise`, `/impressum` and the other legal texts) are redirected to their
 * prefixed form in next.config.ts -- a 301 keeps the links in mails and in
 * search results working and hands what they are worth to the new address.
 *
 * Note that this is NOT the same decision as `DEFAULT_LOCALE`, which says
 * which catalog is the source text every other is translated from. German is
 * still that, and docs/languages.md still describes it correctly. The two
 * answer different questions and are deliberately not the same constant.
 *
 * Deliberately free of dependencies beyond the locale list: `src/middleware.ts`
 * imports it, and middleware runs on the edge.
 */

export const SITE_PAGES = [
  'home',
  'pricing',
  'methods',
  'compare',
  'faq',
  'impressum',
  'agb',
  'datenschutz',
  'avv',
] as const

export type SitePage = (typeof SITE_PAGES)[number]

/**
 * The language that answers without a prefix. See the note above for why it
 * is not `DEFAULT_LOCALE`.
 */
export const SITE_PRIMARY_LOCALE: Locale = 'en'

/**
 * The slug per language -- translated, not transliterated.
 *
 * A slug is read by the person deciding whether to click and by the engine
 * deciding what the page is about, and both read it in their own language.
 * `/fr/tarifs` is worth the extra column over `/fr/preise`.
 *
 * The empty string is the home page of a language.
 */
const SLUGS: Record<SitePage, Record<Locale, string>> = {
  home: { de: '', en: '', fr: '', es: '' },
  pricing: { de: 'preise', en: 'pricing', fr: 'tarifs', es: 'precios' },
  methods: {
    de: 'workshop-methoden',
    en: 'workshop-methods',
    fr: 'methodes-d-animation',
    es: 'metodos-de-facilitacion',
  },
  compare: {
    de: 'sessionlab-alternative',
    en: 'sessionlab-alternative',
    fr: 'alternative-a-sessionlab',
    es: 'alternativa-a-sessionlab',
  },
  faq: { de: 'faq', en: 'faq', fr: 'faq', es: 'faq' },
  impressum: { de: 'impressum', en: 'imprint', fr: 'mentions-legales', es: 'aviso-legal' },
  agb: { de: 'agb', en: 'terms', fr: 'conditions-generales', es: 'condiciones' },
  datenschutz: { de: 'datenschutz', en: 'privacy', fr: 'confidentialite', es: 'privacidad' },
  avv: { de: 'avv', en: 'data-processing', fr: 'sous-traitance', es: 'encargo-de-tratamiento' },
}

/** Where a page lives in a language. Always absolute, never with a trailing slash. */
export function pathFor(page: SitePage, locale: Locale): string {
  const slug = SLUGS[page][locale]
  if (locale === SITE_PRIMARY_LOCALE) return slug === '' ? '/' : `/${slug}`
  return slug === '' ? `/${locale}` : `/${locale}/${slug}`
}

/**
 * Which page an address is, or null if it is not part of the website.
 *
 * Null is the important answer: everything behind the login goes through here
 * too, and for those the language comes from the person rather than the URL.
 */
/**
 * The shape a method's address may take, checked WITHOUT asking the database.
 *
 * This module is imported by src/middleware.ts, which runs on the edge and has
 * no database. So the router recognises the shape and the page decides whether
 * that method exists -- which is also the right split: an address that is not
 * a slug at all is not a 404 worth a query.
 */
const DETAIL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

export function pageForPath(
  pathname: string,
): { page: SitePage; locale: Locale; detail?: string } | null {
  // A person types a trailing slash, a link generator emits one, and neither
  // means a different page.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname
  const [, first = '', second = '', ...rest] = path.split('/')

  const prefixed = isLocale(first) && first !== SITE_PRIMARY_LOCALE
  const locale = prefixed ? first : SITE_PRIMARY_LOCALE
  const slug = prefixed ? second : first
  const detail = prefixed ? (rest[0] ?? '') : second
  // A prefixed address has at most three segments, an unprefixed one at most
  // two -- and the third is only ever a method.
  if (rest.length > (prefixed ? 1 : 0)) return null

  const page = SITE_PAGES.find((candidate) => SLUGS[candidate][locale] === slug)
  if (!page) return null
  if (detail === '') return { page, locale }
  // Only the methods directory has pages beneath it. Everything else keeps the
  // flat shape it had, so a stray segment is still nothing.
  if (page !== 'methods' || !DETAIL_SLUG.test(detail)) return null
  return { page, locale, detail }
}

/** Where one method lives in a language. */
export function methodPathFor(slug: string, locale: Locale): string {
  return `${pathFor('methods', locale)}/${slug}`
}

/**
 * The hreflang set of a method, over the languages it is actually published in.
 *
 * Not all four: a method published only in English has one address. Naming a
 * French URL that answers 404 would be an annotation pointing at nothing, and
 * Google drops a set where one member does not return it.
 */
export function alternatesForMethod(slugs: Partial<Record<Locale, string>>): {
  languages: Partial<Record<Locale, string>>
  xDefault: string | null
} {
  const languages = Object.fromEntries(
    LOCALES.flatMap((locale) => {
      const slug = slugs[locale]
      return slug ? [[locale, methodPathFor(slug, locale)]] : []
    }),
  ) as Partial<Record<Locale, string>>
  const source = slugs[SITE_PRIMARY_LOCALE]
  return { languages, xDefault: source ? methodPathFor(source, SITE_PRIMARY_LOCALE) : null }
}

/**
 * The language an address dictates, or null when it dictates none.
 *
 * On the public website the URL is the only signal that counts. A cookie left
 * over from a previous visit must not serve German at `/en/pricing`: that is
 * the page Google has indexed as English, and a visitor who lands on it from
 * an English result has to find English there.
 */
export function localeForPath(pathname: string): Locale | null {
  return pageForPath(pathname)?.locale ?? null
}

/**
 * What the hreflang block of a page says.
 *
 * All four every time. hreflang is a claim about a set of pages, and an
 * annotation that is not returned by the page it points at is dropped whole --
 * so a partial list is worth exactly as much as none.
 */
export function alternatesFor(page: SitePage): {
  languages: Record<Locale, string>
  xDefault: string
} {
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [locale, pathFor(page, locale)]),
  ) as Record<Locale, string>
  // x-default is what a visitor gets whose language is none of the four.
  // English, because it is the one most of them will be able to read -- and
  // because it is the address without a prefix.
  return { languages, xDefault: pathFor(page, SITE_PRIMARY_LOCALE) }
}
