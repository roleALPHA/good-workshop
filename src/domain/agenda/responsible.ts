/**
 * Who answers for a block.
 *
 * A field of the block itself rather than of its type's `desc`: every block has
 * somebody who is on the hook for it, a break as much as a presentation, and a
 * question the facilitator asks of every row does not belong to a schema a
 * tenant can edit away.
 *
 * One to n people, and a person is either a member of this workspace or
 * somebody who is not -- the client's CEO, an external co-trainer. Both carry a
 * name; a member carries their id as well.
 *
 * THE NAME IS STORED FOR MEMBERS TOO, and that is not duplication for its own
 * sake. The print view, the Markdown export and a guest's reading view have no
 * member directory -- a guest must not be handed one -- and a member who is
 * removed from the workspace leaves no row to look the name up in. Where a
 * directory is at hand, `resolveResponsible` prefers the member's current name,
 * so a renamed colleague is not shown under the old one in the editor.
 */

export type Responsible = {
  name: string
  /** Null for somebody who is not a member of this workspace. */
  memberId: string | null
}

/** A member who can be assigned, as the editor offers them. */
export type AssignablePerson = { id: string; name: string }

export type ResolvedResponsible = Responsible & { external: boolean }

export const MAX_RESPONSIBLE = 20
export const MAX_RESPONSIBLE_NAME = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whatever a client put into the shared document, made into a list the table
 * can hold.
 *
 * Lenient on purpose, like the rest of the materialiser's input: a blank entry
 * is dropped and an overlong name is cut, because refusing the whole list would
 * take every other person off the block with it.
 */
export function normalizeResponsible(raw: unknown): Responsible[] {
  if (!Array.isArray(raw)) return []

  const out: Responsible[] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    if (out.length >= MAX_RESPONSIBLE) break
    if (!entry || typeof entry !== 'object') continue

    const { name, memberId } = entry as { name?: unknown; memberId?: unknown }
    if (typeof name !== 'string') continue
    const trimmed = name.trim().slice(0, MAX_RESPONSIBLE_NAME)
    if (trimmed === '') continue

    const id = typeof memberId === 'string' && UUID.test(memberId) ? memberId : null
    // A member is one person however they are spelled; an external is known
    // only by the name, so the name is the identity.
    const key = id ?? `name:${trimmed.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({ name: trimmed, memberId: id })
  }

  return out
}

/** The list as a person reads it: current names, and who is not a member. */
export function resolveResponsible(
  list: Responsible[],
  people: AssignablePerson[] = [],
): ResolvedResponsible[] {
  const byId = new Map(people.map((person) => [person.id, person.name]))
  return list.map((entry) => ({
    name: (entry.memberId && byId.get(entry.memberId)) || entry.name,
    memberId: entry.memberId,
    external: entry.memberId === null,
  }))
}

/**
 * What typing a name into the field means.
 *
 * Exactly a member's name makes it that member; anything else is somebody from
 * outside. No partial matching: "Mira" silently becoming "Mira Schulz" is a
 * guess, and the guess is wrong the day a second Mira joins. The suggestions
 * under the field are where a partial name turns into a member.
 */
export function responsibleFromInput(
  text: string,
  people: AssignablePerson[] = [],
): Responsible | null {
  const name = text.trim().slice(0, MAX_RESPONSIBLE_NAME)
  if (name === '') return null

  const wanted = name.toLowerCase()
  const member = people.find((person) => person.name.trim().toLowerCase() === wanted)
  return member ? { name: member.name, memberId: member.id } : { name, memberId: null }
}

/** Two letters to recognise somebody by, from their first and last word. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  const first = Array.from(words[0]!)[0]!
  if (words.length === 1) return first.toUpperCase()
  const last = Array.from(words[words.length - 1]!)[0]!
  return (first + last).toUpperCase()
}
