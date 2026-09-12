import de from '@/messages/de/moduleTypes.json'
import en from '@/messages/en/moduleTypes.json'
import es from '@/messages/es/moduleTypes.json'
import fr from '@/messages/fr/moduleTypes.json'
import type { Locale } from './config'

/**
 * The block-type catalog, read WITHOUT next-intl.
 *
 * This looks like duplication of src/i18n/translator.ts and is not. Two
 * reasons, and the second one is the load-bearing one:
 *
 * 1. There is nothing to format. Every value in these files is a plain string
 *    -- a block type's name, a field's title, an enum label. No placeholders,
 *    no plurals, so an ICU engine would be doing nothing but a nested property
 *    lookup with extra steps.
 *
 * 2. IMPORT GRAPH. This is reached from domain/agenda/repo.ts, which the
 *    collaboration server imports -- and that server is bundled into a single
 *    file by scripts/build-collab.mjs. Going through next-intl pulled use-intl,
 *    intl-messageformat and a hundred React references into a process whose
 *    entire job is relaying WebSocket frames: 1.0 MB became 1.2 MB, and the
 *    room took measurably longer to come up. docs/architecture.md is explicit
 *    that this is a separate process in the same image; it should carry what it
 *    uses and nothing else.
 */

const CATALOGS: Record<Locale, unknown> = { de, en, fr, es }

/**
 * `types.check_in.name` out of the catalog, or undefined.
 *
 * Undefined and "translated to an empty string" are different answers: several
 * built-ins legitimately have no description, and a caller has to be able to
 * tell "nothing to say" from "nobody has translated this yet" so it can fall
 * back to the stored German.
 */
export function moduleTypeText(locale: Locale, path: string): string | undefined {
  let node: unknown = CATALOGS[locale]
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string' ? node : undefined
}
