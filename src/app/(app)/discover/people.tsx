import { getTranslations } from 'next-intl/server'

/**
 * How many people a design is written for, in words.
 *
 * Four cases, because a range with open ends is four different sentences and
 * not one with blanks in it: "12–20 people", "from 12 people", "up to 20
 * people", "any number of people". Rendering `null–20` or "0–20" would be the
 * kind of wrong that reads as a bug in the data rather than in the label.
 *
 * The choice and the rendering are split on purpose. `peopleLabel` decides
 * WHICH sentence and is pure, so the four cases are a test table rather than a
 * click-through; `<People>` says it. Threading next-intl's translator into the
 * pure function instead would have meant describing its per-key typing in a
 * hand-written signature -- which is a statement about next-intl that would
 * rot, in exchange for nothing a reader gains.
 */

export type PeopleRange = { minParticipants: number | null; maxParticipants: number | null }

export type PeopleLabel =
  | { key: 'peopleAny' }
  | { key: 'peopleFrom'; min: number }
  | { key: 'peopleTo'; max: number }
  | { key: 'peopleRange'; min: number; max: number }

export function peopleLabel({
  minParticipants: min,
  maxParticipants: max,
}: PeopleRange): PeopleLabel {
  // `!== null` and not a truthiness check: a lower bound of one is a real
  // answer, and "from 1 person" must not collapse into "any number".
  if (min !== null && max !== null) return { key: 'peopleRange', min, max }
  if (min !== null) return { key: 'peopleFrom', min }
  if (max !== null) return { key: 'peopleTo', max }
  return { key: 'peopleAny' }
}

export async function People({ range }: { range: PeopleRange }) {
  const t = await getTranslations('discover')
  const label = peopleLabel(range)

  switch (label.key) {
    case 'peopleRange':
      return <>{t('peopleRange', { min: label.min, max: label.max })}</>
    case 'peopleFrom':
      return <>{t('peopleFrom', { min: label.min })}</>
    case 'peopleTo':
      return <>{t('peopleTo', { max: label.max })}</>
    default:
      return <>{t('peopleAny')}</>
  }
}
