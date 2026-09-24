import type { getTranslations } from 'next-intl/server'
import type { EntrySummary } from '@/cloud/catalog/ports'
import { formatDuration } from '@/features/agenda/duration'
import { peopleLabel } from './people'

/**
 * A row of Discover, with every word already chosen.
 *
 * WHY THE ISLAND IS NOT HANDED THE ENTRY AND A SET OF LABELS. It used to be,
 * with `days: (count) => t('days', { count })` among them -- and functions
 * cannot cross the boundary into a client component. React refuses them, and
 * the page throws at request time rather than at build time, so a typecheck, a
 * lint run and the whole unit suite all stay green while the screen is white.
 *
 * Nothing here is a function, and that is the point: this type is what can be
 * serialised, so the compiler now refuses what React would have refused at
 * three in the afternoon. The same trap is still set anywhere a server
 * component hands a client one a formatter.
 *
 * It also keeps every translation on the server, which is why `discover` can
 * stay out of CLIENT_NAMESPACES.
 */
export type EntryView = {
  id: string
  href: string
  name: string
  summary: string
  /** Days, duration, people -- already said, in order, ready to lay out. */
  meta: string[]
  facets: { key: string; label: string }[]
  /** The sentence to show when this language has no translation, or null. */
  untranslated: string | null
}

/**
 * next-intl's own translator for this namespace.
 *
 * Its type rather than a hand-written one: describing next-intl's per-key
 * signature by hand is a statement about next-intl that rots, in exchange for
 * nothing a reader gains. The same reasoning ./people.tsx already wrote down.
 */
type Say = Awaited<ReturnType<typeof getTranslations<'discover'>>>

export function entryView(entry: EntrySummary, t: Say): EntryView {
  return {
    id: entry.id,
    // By id, never by the slug a public entry also carries: a slug is unique
    // per LANGUAGE, and this page's language comes from the session rather
    // than from the path, so the same address would open a different entry for
    // a colleague reading in another language.
    href: `/discover/${entry.id}`,
    name: entry.name,
    summary: entry.summary,
    meta: [
      t('days', { count: entry.dayCount }),
      formatDuration(entry.durationMinutes, { spaced: true }),
      people(entry, t),
    ],
    facets: entry.facets,
    untranslated: entry.translated ? null : t('untranslated'),
  }
}

/** The four sentences `peopleLabel` chooses between, said. */
function people(entry: EntrySummary, t: Say): string {
  const label = peopleLabel(entry)
  switch (label.key) {
    case 'peopleRange':
      return t('peopleRange', { min: label.min, max: label.max })
    case 'peopleFrom':
      return t('peopleFrom', { min: label.min })
    case 'peopleTo':
      return t('peopleTo', { max: label.max })
    default:
      return t('peopleAny')
  }
}
