import type { Locale } from '@/i18n/config'

/**
 * What a facilitator may type into a duration field, per language.
 *
 * Four rules keep this from becoming a parser zoo:
 *
 *  1. The neutral core -- `90`, `1:30`, `1h30`, `1h30m`, `1.5h`, `1,5h` -- is
 *     accepted in EVERY language, always. That covers most of what anybody
 *     types, and it means no language is ever worse served than another.
 *  2. A language adds only its WORDS. The regexes are built once from these
 *     arrays rather than hand-written four times.
 *  3. The decimal comma is accepted everywhere, not per language. German,
 *     French and Spanish all use it, and accepting `1,5h` under English costs
 *     nothing because it has no other reading as a duration.
 *  4. This lives in TypeScript and NOT in the message catalog. It is parser
 *     input, not display text: a translator editing a JSON string must not be
 *     able to break the most-used control in the application.
 */
export type DurationVocabulary = {
  readonly hour: readonly string[]
  readonly minute: readonly string[]
}

export const DURATION_VOCABULARY: Record<Locale, DurationVocabulary> = {
  de: { hour: ['h', 'std', 'stunde', 'stunden'], minute: ['m', 'min', 'minute', 'minuten'] },
  en: {
    hour: ['h', 'hr', 'hrs', 'hour', 'hours'],
    minute: ['m', 'min', 'mins', 'minute', 'minutes'],
  },
  fr: { hour: ['h', 'heure', 'heures'], minute: ['m', 'min', 'minute', 'minutes'] },
  es: { hour: ['h', 'hora', 'horas'], minute: ['m', 'min', 'minuto', 'minutos'] },
}
