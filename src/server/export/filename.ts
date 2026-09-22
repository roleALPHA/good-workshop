/**
 * A filename that survives every language.
 *
 * The German digraphs run FIRST and the order is load-bearing: strip the
 * diacritics first and `ü` collapses to `u`, which would silently change the
 * filename of every German export on upgrade.
 *
 * Then NFD plus removing the combining marks, which handles é, ñ, ç, à and the
 * rest. Before that, "Réunion stratégie" came out as `r-union-strat-gie`.
 *
 * Deliberately not locale-dependent: the transliteration is a property of the
 * TITLE's language, and the title is free tenant text that nobody has declared
 * a language for. Unconditional ä→ae never corrupts a French title -- ä and ö
 * appear in French only in loanwords -- and it keeps one code path.
 */
export function exportFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replaceAll('ä', 'ae')
      .replaceAll('ö', 'oe')
      .replaceAll('ü', 'ue')
      .replaceAll('ß', 'ss')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'workshop'
  )
}
