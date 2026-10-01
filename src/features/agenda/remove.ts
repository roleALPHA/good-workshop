import type { DayDoc } from '@/domain/agenda/types'

/**
 * Deletes a row from a day held in memory: a block, or a section with what is
 * scheduled inside it, or a breakout with its strands.
 *
 * The same rule as removeBlock in src/domain/collab/ops.ts, for the demo,
 * which has no shared document. A parked block survives the section it was
 * parked from: it belongs to the parking area, and the delete button counts
 * only what is in the schedule. It moves to the end of the day and stays
 * parked.
 */
export function removeFromDay(doc: DayDoc, id: string): DayDoc {
  if (!doc.clusters.some((c) => c.id === id)) {
    return { ...doc, modules: doc.modules.filter((m) => m.id !== id) }
  }

  // The section and every cluster below it -- for a breakout, its strands.
  const doomed = new Set([id])
  for (let grew = true; grew;) {
    grew = false
    for (const c of doc.clusters) {
      if (c.parentClusterId !== null && doomed.has(c.parentClusterId) && !doomed.has(c.id)) {
        doomed.add(c.id)
        grew = true
      }
    }
  }

  const clusters = doc.clusters.filter((c) => !doomed.has(c.id))
  const survivors = doc.modules.filter((m) => m.clusterId === null || !doomed.has(m.clusterId))
  const rescued = doc.modules.filter(
    (m) => m.clusterId !== null && doomed.has(m.clusterId) && m.parked,
  )

  let last = Math.max(
    -1,
    ...survivors.filter((m) => m.clusterId === null).map((m) => m.order),
    ...clusters.filter((c) => c.parentClusterId === null).map((c) => c.order),
  )
  const moved = rescued.map((m) => ({ ...m, clusterId: null, order: ++last }))

  return { ...doc, clusters, modules: [...survivors, ...moved] }
}
