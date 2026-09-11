import de from '@/messages/de.json'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import fr from '@/messages/fr.json'
import deModuleTypes from '@/messages/de/moduleTypes.json'
import enModuleTypes from '@/messages/en/moduleTypes.json'
import esModuleTypes from '@/messages/es/moduleTypes.json'
import frModuleTypes from '@/messages/fr/moduleTypes.json'
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
/**
 * `moduleTypes` is a file of its own rather than another key in de.json.
 *
 * It is generated from src/domain/moduleType/builtins.json and checked against
 * it (see catalogs.test.ts), which makes it a different kind of thing from the
 * interface strings: nobody writes the German side by hand. Keeping it apart
 * also keeps it out of the typed Messages declaration, where a catalog whose
 * keys are tenant data has no business.
 *
 * It never reaches the browser -- see CLIENT_NAMESPACES.
 */
export const CATALOGS: Record<Locale, Record<string, unknown>> = {
  de: { ...de, moduleTypes: deModuleTypes },
  en: { ...en, moduleTypes: enModuleTypes },
  fr: { ...fr, moduleTypes: frModuleTypes },
  es: { ...es, moduleTypes: esModuleTypes },
}
