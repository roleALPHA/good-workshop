import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config'

/**
 * Which language a request is rendered in.
 *
 * Pure on purpose: no `next/headers`, no database, no React. The whole
 * precedence rule is one testable function, and the places that need a locale
 * outside a request -- the Markdown exporter, the mail templates, MCP -- can
 * call it with whatever they know.
 */

export type LocaleSources = {
  /**
   * The language the address itself names, for the pages that have one.
   *
   * Only the public website does: `src/cloud/site/routes.ts` turns a pathname
   * into this, and returns null for everything behind the login. It outranks
   * the person on purpose -- see resolveLocale.
   */
  url?: string | null
  /** identity.locale, for a signed-in person. Untrusted: see asLocale. */
  user?: string | null
  /** The gw_locale cookie, which is all a signed-out visitor has. */
  cookie?: string | null
  /** The browser's own hint, for a first visit with no cookie yet. */
  acceptLanguage?: string | null
}

/**
 * The address wins where there is one, and the person wins everywhere else.
 *
 * That order looks backwards -- a signed-in person's own setting overruled by
 * a URL -- and it is the only order that works for a page in a search index.
 * `/en/pricing` is indexed as English and linked from English results; serving
 * it in German to a visitor whose cookie happens to say so makes the result
 * and the page disagree, and Google answers by dropping the hreflang
 * annotation for the whole set. Behind the login no address names a language,
 * `url` is null, and the old chain decides exactly as before.
 */
export function resolveLocale(sources: LocaleSources): Locale {
  return (
    asLocale(sources.url) ??
    asLocale(sources.user) ??
    asLocale(sources.cookie) ??
    negotiate(sources.acceptLanguage) ??
    DEFAULT_LOCALE
  )
}

/**
 * `identity.locale` is `text not null default 'de'` with no check constraint,
 * and the column is a documented seam for OIDC/SAML imports. So a value read
 * from it is input, not a guarantee: `'de-AT'`, `''` or anything an external
 * IdP writes must fall through to the next source rather than throw.
 */
export function asLocale(value: unknown): Locale | null {
  return isLocale(value) ? value : null
}

/**
 * `de-CH,de;q=0.9,en;q=0.8` -> 'de'.
 *
 * Region subtags are dropped rather than matched: there is one German catalog,
 * and an Austrian browser asking for `de-AT` wants German, not English. A
 * malformed header returns null instead of throwing -- this runs on the login
 * page, where a 500 means nobody can get in.
 */
export function negotiate(header: string | null | undefined): Locale | null {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/i.exec(p)).find((m) => m !== null)
      // A missing q means 1, per RFC 9110 -- and so does an unparseable one.
      // `fr;q=abc` still says the visitor reads French, which is the part worth
      // acting on; dropping the entry over its weight would lose a real
      // preference to a typo.
      return { tag: tag.trim().toLowerCase(), quality: q ? Number.parseFloat(q[1]!) : 1 }
    })
    // q=0 is a refusal, not a weak preference.
    .filter((entry) => entry.tag !== '' && entry.quality > 0)
    // Stable sort by quality, descending. Equal qualities keep header order,
    // which is what a browser means by listing one language before another.
    .sort((a, b) => b.quality - a.quality)

  for (const { tag } of ranked) {
    // `*` means "anything", which is not a preference -- let the default win.
    if (tag === '*') return null
    const base = tag.split('-')[0]!
    const match = LOCALES.find((locale) => locale === base)
    if (match) return match
  }

  return null
}
