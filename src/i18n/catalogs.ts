import de from '@/messages/de.json'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import fr from '@/messages/fr.json'
import type { Locale } from './config'

/**
 * Static imports, deliberately, rather than `await import(`../messages/${locale}.json`)`.
 *
 * A template-literal import compiles to a webpack context module. It works in
 * `next dev` and comes out empty in `.next/standalone` -- the exact failure
 * class the outputFileTracingRoot comment in next.config.ts was written about,
 * and the one that hurts most to discover late, because the container starts
 * fine and every string renders as its own key.
 *
 * Four catalogs of roughly 12 KB each in the server bundle cost nothing. What
 * reaches the browser is decided by CLIENT_NAMESPACES, not by this file.
 */
export const CATALOGS: Record<Locale, Record<string, unknown>> = { de, en, fr, es }
