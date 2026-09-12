/**
 * The four languages, and the one place that decides what a locale is.
 *
 * No `[locale]` segment and no next-intl middleware: this application lives
 * entirely behind a session, so there is nothing to index and no reason to pay
 * for locale-prefixed URLs. The language is a property of the person, not of
 * the address -- see src/i18n/resolve.ts for where it comes from.
 */

export const LOCALES = ['de', 'en', 'fr', 'es'] as const

export type Locale = (typeof LOCALES)[number]

/**
 * German is the source text, not merely the first entry. Every other catalog is
 * a translation of it, and the E2E suite asserts against it -- see the pinned
 * `locale` in playwright.config.ts.
 */
export const DEFAULT_LOCALE: Locale = 'de'

/** Set by the language switcher; the only locale signal a signed-out visitor has. */
export const LOCALE_COOKIE = 'gw_locale'

export const LOCALE_LABELS: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * The namespaces that travel to the browser.
 *
 * Everything else stays on the server: `meta` renders in generateMetadata,
 * `export` and `mail` produce files and messages the browser never builds, and
 * `moduleTypes` is resolved into the DayDoc before it is serialised. Keeping
 * them out is one line here rather than a bundle audit later.
 */
export const CLIENT_NAMESPACES = [
  'common',
  'nav',
  'auth',
  'library',
  'workshop',
  'agenda',
  'settings',
  'admin',
  'errors',
  'enums',
] as const
