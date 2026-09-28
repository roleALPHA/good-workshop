import { generateKeyBetween } from 'fractional-indexing'

/**
 * Ordering keys.
 *
 * Fractional (lexicographic string) keys rather than integer positions, and the
 * deciding factor is the day-level list: clusters and day-level modules live in
 * two tables but ONE ordered list. With integers that needs a sequence shared
 * across tables and a transactional renumber of both on every insert. With
 * fractional keys they simply share a key space and sort by (position, id).
 *
 * The rest follows: a move is a single-row UPDATE, two people moving different
 * blocks never collide, and duplicating a day can copy positions verbatim.
 *
 * These keys never leave the server. Reads project 0-based ordinals instead --
 * an LLM cannot reason about `a0V` and will cheerfully hallucinate one.
 */

const MAX_KEY_LENGTH = 48

export type Ordered = { id: string; position: string }

export type Nested = Ordered & { parentId: string | null }

/** Sibling lists, one per parent. Day level lives under `null`. */
export function groupByParent<T extends Nested>(rows: T[]): Map<string | null, T[]> {
  const out = new Map<string | null, T[]>()
  for (const row of rows) {
    const bucket = out.get(row.parentId)
    if (bucket) bucket.push(row)
    else out.set(row.parentId, [row])
  }
  return out
}

/**
 * 0-based ordinals, counted per sibling list.
 *
 * One function for all three lists -- the day, the strands of a breakout, the
 * blocks of a section -- because three near-copies are exactly the place where
 * one of them later drifts. "My place among my siblings, from 0" is the same
 * sentence at every depth, and it is the sentence `afterId` is answered with:
 * a strand whose blocks were numbered out of the day's key space would make
 * that parameter unreadable for a model.
 */
export function ordinalsByParent(rows: Nested[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const bucket of groupByParent(rows).values()) {
    sortByPosition(bucket).forEach((row, index) => out.set(row.id, index))
  }
  return out
}

/** Deterministic order, matching `ORDER BY position, id` on the server. */
export function sortByPosition<T extends Ordered>(items: T[]): T[] {
  return items
    .slice()
    .sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : a.id.localeCompare(b.id),
    )
}

export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)
}

/** A key that sorts after everything in the list. */
export function keyAtEnd(siblings: Ordered[]): string {
  const sorted = sortByPosition(siblings)
  return generateKeyBetween(sorted.at(-1)?.position ?? null, null)
}

export type Placement = { position: string; rebalance: Ordered[] | null }

/**
 * Where to insert relative to an anchor sibling.
 *
 * Anchor-based rather than index-based: if a sibling moved concurrently you
 * still land after the right neighbour instead of at a stale index.
 *
 * Repeatedly inserting between the same two neighbours grows keys by about a
 * character each time. Past a threshold the sibling list is redistributed in
 * the same transaction -- the workshop lock is already held, sibling lists are
 * small, and the operation is rare and invisible.
 */
export function placeAfter(siblings: Ordered[], afterId: string | null): Placement {
  const sorted = sortByPosition(siblings)

  const index = afterId === null ? -1 : sorted.findIndex((s) => s.id === afterId)
  if (afterId !== null && index === -1) {
    // The anchor vanished (deleted concurrently). Appending is the safe answer:
    // the block lands somewhere sensible instead of the move failing.
    return { position: keyAtEnd(sorted), rebalance: null }
  }

  const before = index >= 0 ? sorted[index]!.position : null
  const after = sorted[index + 1]?.position ?? null
  const position = generateKeyBetween(before, after)

  if (position.length <= MAX_KEY_LENGTH) return { position, rebalance: null }

  return { position: '', rebalance: redistribute(sorted, index + 1) }
}

/** Evenly spaced keys for a whole sibling list, with a slot left at `insertAt`. */
function redistribute(sorted: Ordered[], insertAt: number): Ordered[] {
  const out: Ordered[] = []
  let previous: string | null = null

  for (let i = 0; i <= sorted.length; i++) {
    const key: string = generateKeyBetween(previous, null)
    previous = key
    if (i === insertAt) {
      out.push({ id: '', position: key })
      continue
    }
    const item = sorted[i > insertAt ? i - 1 : i]
    if (item) out.push({ id: item.id, position: key })
  }
  return out
}
