/**
 * The curated category palette.
 *
 * A module type stores a token NAME, never a hex value. Everything downstream --
 * the row's left bar, the legend chip, the cluster band, the drag ghost, the
 * print stylesheet -- reads `--cat-bar` / `--cat-bg` / `--cat-fg` from the class
 * this module puts on the row. Consequence: dark mode needs no per-component
 * work and contrast is tunable in exactly one place (src/styles/globals.css).
 */
export const CATEGORY_COLORS = [
  'rose',
  'red',
  'orange',
  'amber',
  'emerald',
  'teal',
  'cyan',
  'blue',
  'violet',
  'slate',
] as const

export type CategoryColor = (typeof CATEGORY_COLORS)[number]

const FALLBACK: CategoryColor = 'slate'

export function isCategoryColor(value: string): value is CategoryColor {
  return (CATEGORY_COLORS as readonly string[]).includes(value)
}

/**
 * Maps a stored token name to its CSS class. Unknown values (a token removed
 * from the palette, a hand-edited row) fall back rather than rendering an
 * unstyled row -- reads are always lenient.
 */
export function catClass(color: string | null | undefined): string {
  return `cat-${color && isCategoryColor(color) ? color : FALLBACK}`
}
