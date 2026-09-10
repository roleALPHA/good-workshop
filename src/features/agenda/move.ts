import type { DayDoc } from '@/domain/agenda/types'
import { flattenDay } from './flatten'
import type { Projection } from './projection'
import { rowsForDrag, toProjectionRows } from './projection'

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

  // A cluster travelled without its children; they follow it here.
  const order = active.kind === 'cluster' ? reattachChildren(doc, moved, activeId) : moved

  return renumber(doc, order)
}

function reattachChildren(
  doc: DayDoc,
  rows: ReturnType<typeof toProjectionRows>,
  clusterId: string,
): ReturnType<typeof toProjectionRows> {
  const children = doc.modules
    .filter((m) => m.clusterId === clusterId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, kind: 'module' as const, depth: 1 as const, parentId: clusterId }))

  const at = rows.findIndex((r) => r.id === clusterId)
  const out = rows.slice()
  out.splice(at + 1, 0, ...children)
  return out
}

/** Rewrites `order` and `clusterId` on the document to match the new row order. */
function renumber(doc: DayDoc, rows: ReturnType<typeof toProjectionRows>): DayDoc {
  const clusterById = new Map(doc.clusters.map((c) => [c.id, c]))
  const moduleById = new Map(doc.modules.map((m) => [m.id, m]))

  let dayOrder = 0
  const childOrder = new Map<string, number>()

  const clusters: DayDoc['clusters'] = []
  const modules: DayDoc['modules'] = []

  for (const row of rows) {
    if (row.kind === 'cluster') {
      const cluster = clusterById.get(row.id)
      if (cluster) clusters.push({ ...cluster, order: dayOrder++ })
      continue
    }

    const mod = moduleById.get(row.id)
    if (!mod) continue

    if (row.depth === 1 && row.parentId !== null) {
      const next = childOrder.get(row.parentId) ?? 0
      childOrder.set(row.parentId, next + 1)
      modules.push({ ...mod, clusterId: row.parentId, order: next })
    } else {
      modules.push({ ...mod, clusterId: null, order: dayOrder++ })
    }
  }

  return { ...doc, clusters, modules }
}
