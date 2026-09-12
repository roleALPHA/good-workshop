import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { readSessionCached } from '@/server/auth/session'
import { CATALOGS } from './catalogs'
import { asLocale, resolveLocale } from './resolve'
import { LOCALE_COOKIE, type Locale } from './config'

/**
 * The one place a request learns its language.
 *
 * Resolution lives here rather than in middleware for one hard reason:
 * readSession reaches Postgres through `withAuth`, and middleware runs on the
 * edge across a matcher that includes /api/health, /api/mcp and /verify. A
 * split -- cookie in middleware, identity here -- would be two places that have
 * to agree about precedence forever.
 *
 * Nothing is lost to caching: every route in src/app is already
 * `force-dynamic`, so `cookies()` and `headers()` foreclose no optimisation
 * that exists.
 */
export default getRequestConfig(async ({ locale: requested }) => {
  /**
   * An explicit locale short-circuits everything below.
   *
   * This is how the Markdown exporter, the mail templates and MCP render in a
   * language that is not the current viewer's: `getTranslations({locale: 'fr'})`
   * arrives here as `requested`. Returning before `cookies()` matters as much
   * as the answer -- those are request-scoped, and a mail sent from a retry or
   * a background job has no request to read. Rendering with an explicit locale
   * has to work outside one, or it works until the day something moves.
   */
  const explicit = asLocale(requested)
  if (explicit) return configFor(explicit)

  const [cookieStore, headerList, session] = await Promise.all([
    cookies(),
    headers(),
    // A database that is down must not turn /login into a stack trace -- there
    // would then be no way back in. src/app/page.tsx makes the same allowance.
    readSessionCached().catch(() => null),
  ])

  return configFor(
    resolveLocale({
      user: session?.locale,
      cookie: cookieStore.get(LOCALE_COOKIE)?.value,
      acceptLanguage: headerList.get('accept-language'),
    }),
  )
})

function configFor(locale: Locale) {
  return {
    locale,
    messages: CATALOGS[locale],
    /**
     * Explicit, and it matters.
     *
     * Without it next-intl formats on the server in the server's zone and in
     * the browser in the visitor's -- and every date here comes out of a
     * `timestamptz`, so the two disagree and React logs a hydration mismatch on
     * a page nobody changed.
     */
    timeZone: process.env.GW_TIMEZONE ?? 'Europe/Berlin',
    formats: {
      dateTime: {
        // Named once so the three call sites cannot drift apart; they already
        // said the same thing three different ways.
        short: { dateStyle: 'medium' },
      },
    },
  } as const
}
