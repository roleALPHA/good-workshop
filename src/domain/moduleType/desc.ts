/**
 * Writing a single type-specific field without disturbing the rest.
 *
 * One function rather than a spread at every call site, because the rule it
 * carries is easy to get wrong and fails late: `undefined` means "not set" and
 * the key has to go, not sit there holding an undefined. A block's schema says
 * `additionalProperties: false`, so a key with no value is rejected on the way
 * to the database -- and the editor would keep showing the value it thought it
 * had saved.
 */
export function setDescField(
  desc: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next = { ...desc }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next
}

/** The strings of an array field, with anything else in it left behind. */
export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * The fields that differ between two descriptions, a removed one as
 * `undefined`.
 *
 * What the editor writes, rather than the whole object it was handed: written
 * whole, two people in two fields of one block overwrote each other. Compared
 * by value, because rich text and lists arrive as fresh objects on every
 * render.
 */
export function descChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = after[key]
  }
  return out
}
