import type { FlatRow } from './flatten'

/**
 * What the line under a row may add, and where it lands.
 *
 * A block and a section answer differently at the same line, because they may
 * live in different places: a block goes into a section, a section only ever
 * onto the day. Under the last block of a section the two part ways -- the
 * block joins the section, a new section follows it. That is the only line
 * where both can be meant, and it is where people reach for "the next part".
 */
export type InsertSlot = {
  /** Stable per line, for keeping one of them open. */
  key: string
  /** The row the line stands under; null for the line above the first row. */
  anchor: string | null
  /** How far the line is indented: where a block would land. */
  depth: 0 | 1
  block: { parentId: string | null; afterId: string | null }
  /** Where a section or breakout goes, or null where none may be added. */
  section: { afterId: string | null } | null
}

/**
 * The line under `afterRowId`, or above the first row for null.
 *
 * Null means no line: inside a breakout, whose strands have a button of their
 * own, and for a row that is not in the list.
 */
export function insertSlot(rows: FlatRow[], afterRowId: string | null): InsertSlot | null {
  if (afterRowId === null) {
    return {
      key: 'start',
      anchor: null,
      depth: 0,
      block: { parentId: null, afterId: null },
      section: { afterId: null },
    }
  }

  const row = rows.find((r) => r.id === afterRowId)
  if (!row || row.kind === 'gap') return null

  const onDay = (afterId: string): InsertSlot => ({
    key: afterRowId,
    anchor: afterRowId,
    depth: 0,
    block: { parentId: null, afterId },
    section: { afterId },
  })

  if (row.depth === 0) {
    // A section header opens the section: the line under it is its first slot.
    if (row.kind === 'cluster' && row.mode !== 'parallel') {
      return {
        key: afterRowId,
        anchor: afterRowId,
        depth: 1,
        block: { parentId: row.id, afterId: null },
        section: row.childCount === 0 ? { afterId: row.id } : null,
      }
    }
    return onDay(row.id)
  }

  // Below the day: only the blocks of an ordinary section get a line.
  if (row.kind !== 'module' || row.depth !== 1 || row.parentId === null) return null
  const parent = rows.find((r) => r.id === row.parentId)
  if (!parent || parent.kind !== 'cluster' || parent.mode === 'parallel') return null

  const last = rows.filter((r) => r.kind === 'module' && r.parentId === parent.id).at(-1)
  return {
    key: afterRowId,
    anchor: afterRowId,
    depth: 1,
    block: { parentId: parent.id, afterId: row.id },
    section: last?.id === row.id ? { afterId: parent.id } : null,
  }
}
