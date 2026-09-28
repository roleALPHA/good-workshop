import type { DayDoc } from '@/domain/agenda/types'
import { flattenDay, type Depth } from './flatten'
import type { Projection } from './projection'
import { descendants, rowsForDrag, toProjectionRows } from './projection'

/**
 * Applies a completed drag to the document.
 *
 * The whole sibling order is renumbered rather than nudged. Sibling lists here
 * are tens of rows, the cost is nothing, and it makes the result impossible to
 * get subtly wrong -- no gaps, no collisions, no drift after a hundred moves.
 *
 * The server will not do it this way: there, ordering is a fractional key so a
 * move is a single-row UPDATE and two people moving different blocks never
 * collide. This function is the client's local, optimistic equivalent, and it
 * has to produce the same *visible* order the server would.
 */
export function applyMove(doc: DayDoc, activeId: string, projection: Projection): DayDoc {
  if (!projection.valid) return doc

  // Always project over the uncollapsed list: a collapsed cluster still owns
  // its children, and they must travel with it.
  const rows = rowsForDrag(toProjectionRows(flattenDay(doc)), activeId)
  const from = rows.findIndex((r) => r.id === activeId)
  if (from === -1) return doc

  const active = rows[from]!
  const moved = rows.slice()
  moved.splice(from, 1)
  moved.splice(projection.index, 0, {
    ...active,
    depth: projection.depth,
    parentId: projection.parentId,
  })

  // A container travelled without its children; they follow it here.
  const order =
    active.kind === 'cluster' ? reattachChildren(doc, moved, activeId, projection) : moved

  return renumber(doc, order)
}

/**
 * Puts a moved container's subtree back behind it.
 *
 * Taken from the freshly flattened document rather than rebuilt, so a breakout
 * keeps its strands AND their blocks, in the order they had. Rebuilding one
 * level of children was enough while the tree was two deep; with a breakout it
 * would have dropped every block of every strand on the floor.
 */
function reattachChildren(
  doc: DayDoc,
  rows: ReturnType<typeof toProjectionRows>,
  containerId: string,
  projection: Projection,
): ReturnType<typeof toProjectionRows> {
  const all = toProjectionRows(flattenDay(doc))
  const inside = descendants(all, containerId)

  // The subtree keeps its shape; only its distance from the day changes, by
  // however far the container itself moved.
  const container = all.find((r) => r.id === containerId)
  const shift = projection.depth - (container?.depth ?? 0)
  const children = all
    .filter((r) => r.id !== containerId && inside.has(r.id))
    .map((r) => ({ ...r, depth: Math.max(0, Math.min(2, r.depth + shift)) as Depth }))

  const at = rows.findIndex((r) => r.id === containerId)
  const out = rows.slice()
  out.splice(at + 1, 0, ...children)
  return out
}

/**
 * Rewrites `order` and the parent on the document to match the new row order.
 *
 * One counter per parent, at every depth. The day level keeps sharing a counter
 * between clusters and day-level blocks, exactly as before -- they share a
 * sibling list, so they share a numbering.
 */
function renumber(doc: DayDoc, rows: ReturnType<typeof toProjectionRows>): DayDoc {
  const clusterById = new Map(doc.clusters.map((c) => [c.id, c]))
  const moduleById = new Map(doc.modules.map((m) => [m.id, m]))

  const seen = new Map<string | null, number>()
  const next = (parent: string | null): number => {
    const n = seen.get(parent) ?? 0
    seen.set(parent, n + 1)
    return n
  }

  const clusters: DayDoc['clusters'] = []
  const modules: DayDoc['modules'] = []

  for (const row of rows) {
    if (row.kind === 'cluster') {
      const cluster = clusterById.get(row.id)
      if (cluster) {
        clusters.push({ ...cluster, parentClusterId: row.parentId, order: next(row.parentId) })
      }
      continue
    }

    const mod = moduleById.get(row.id)
    if (!mod) continue
    modules.push({ ...mod, clusterId: row.parentId, order: next(row.parentId) })
  }

  return { ...doc, clusters, modules }
}
