import { createTranslator } from 'next-intl'
import { CATALOGS } from './catalogs'
import type { Locale } from './config'

/**
 * A translator for a language that is not the current viewer's.
 *
 * `getTranslations()` resolves against the request, which is right for a page
 * and wrong for everything that renders on somebody else's behalf: the mail a
 * German admin's invitation sends to a Spanish colleague, the Markdown export a
 * facilitator hands to French participants, the error an MCP tool returns to a
 * model in English. Those have a locale of their own, and several of them have
 * no request at all -- a retried send, a background job.
 *
 * So this reads the catalog directly. No request, no cookies, no session, and
 * no dependence on whether the module was loaded in a server or client build --
 * which is what makes it testable in plain Vitest.
 */
/**
 * Keys here are computed -- `domain.${error.messageKey}` -- so the signature is
 * a plain string rather than next-intl's key union. The union still guards
 * every literal call through `useTranslations`/`getTranslations`; what guards
 * these is src/i18n/catalogs.test.ts, which walks DOMAIN_ERROR_KEYS and
 * FIELD_ERROR_KEYS against all four catalogs.
 */
export type Translate = ((key: string, params?: Record<string, string | number>) => string) & {
  /**
   * Whether the catalog actually has that key.
   *
   * Needed wherever a key is assembled from data -- a module type's system_key,
   * a field name out of a tenant's JSON Schema -- because "not translated" and
   * "translated to the empty string" are different answers, and the first one
   * has to fall back to what is stored rather than render a key at somebody.
   */
  has(key: string): boolean
}

export function translator(locale: Locale, namespace?: string): Translate {
  const t = createTranslator({
    locale,
    messages: CATALOGS[locale],
    namespace,
    // The fallback is the key, not an empty string: something rendered with a
    // missing message should be obviously wrong in a bug report rather than
    // quietly absent from a sentence.
    getMessageFallback: ({ key }) => key,
  })
  return t as unknown as Translate
}
