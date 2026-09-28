import type { ClusterDto } from '@/domain/agenda/types'
import type { FlatRow } from './flatten'

/**
 * Folds the flat list where the layout stops being one-dimensional.
 *
 * The document stays flat for the editor, for drag & drop and for the keyboard
 * -- one array, one order, one index. Only rendering needs to know that a
 * breakout's strands stand side by side, so the grouping happens here, once,
 * right before the rows are drawn. dnd-kit does not mind: `SortableContext`
 * wants ids, not DOM siblings.
 */
export type RenderNode =
  | { kind: 'row'; row: FlatRow }
  | {
      kind: 'breakout'
      id: string
      row: FlatRow
      cluster: ClusterDto
      strands: { id: string; row: FlatRow; cluster: ClusterDto; rows: FlatRow[] }[]
    }

/**
 * Relies on exactly one invariant of flattenDay: a parallel cluster is followed
 * immediately by its strands, and each strand immediately by its blocks. If
 * that is ever violated the row falls back to `kind: 'row'` rather than
 * throwing -- a broken agenda has to stay readable, even while it is wrong.
 */
export function groupBreakouts(rows: FlatRow[]): RenderNode[] {
  const out: RenderNode[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    if (row.kind !== 'cluster' || row.mode !== 'parallel') {
      out.push({ kind: 'row', row })
      continue
    }

    const node: Extract<RenderNode, { kind: 'breakout' }> = {
      kind: 'breakout',
      id: row.id,
      row,
      cluster: row.cluster,
      strands: [],
    }

    // Walk forward while the rows still belong to this breakout. A gap row
    // carries the depth of the row it precedes, so it travels with its strand.
    let j = i + 1
    while (j < rows.length) {
      const next = rows[j]!
      if (next.depth === 0) break

      if (next.kind === 'cluster' && next.depth === 1 && next.parentId === row.id) {
        node.strands.push({ id: next.id, row: next, cluster: next.cluster, rows: [] })
        j++
        continue
      }

      const strand = node.strands.at(-1)
      if (!strand || next.depth !== 2) break
      strand.rows.push(next)
      j++
    }

    out.push(node)
    i = j - 1
  }

  return out
}
