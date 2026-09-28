import type { ScheduleItem } from './types'

/**
 * The flat item list, read back as the tree it describes.
 *
 * `computeSchedule` keeps taking a flat array because the array ORDER is
 * information -- it is the render order, and a tree type would have to carry it
 * again as a field. So the shape is rebuilt here, in the one place that needs
 * to know about it, and the walk downstream stays about the clock.
 */
export type ScheduleTree = {
  /** What sits at day level, in the order the flat list had it. */
  roots: ScheduleItem[]
  childrenOf: Map<string, ScheduleItem[]>
}

export function buildTree(items: ScheduleItem[]): ScheduleTree {
  const containers = new Set(items.filter((i) => i.kind === 'cluster').map((i) => i.id))
  const roots: ScheduleItem[] = []
  const childrenOf = new Map<string, ScheduleItem[]>()

  for (const item of items) {
    const parent = item.clusterId
    // An item whose parent is not in this list -- or is not a container, or is
    // itself -- lands at day level, at exactly the spot the flat list had it.
    // That is how this function behaved before breakouts too, where a module
    // with an unknown clusterId simply came along. A block nobody can see is
    // worse than a block in the wrong section.
    if (parent === null || parent === item.id || !containers.has(parent)) {
      roots.push(item)
      continue
    }
    const bucket = childrenOf.get(parent)
    if (bucket) bucket.push(item)
    else childrenOf.set(parent, [item])
  }

  // A parent loop -- which two clients writing the same document can produce in
  // principle -- would otherwise leave its members reachable from nothing and
  // silently off the clock. Anything the walk from the roots does not reach is
  // promoted to day level instead.
  //
  // Promoting is not enough on its own: the edge INTO the promoted item has to
  // go with it, or the walk downstream follows the loop round for ever. Cutting
  // it here rather than guarding the walk keeps the cycle from existing at all,
  // so no later reader of this tree has to remember it might.
  const seen = new Set<string>()
  const take = (item: ScheduleItem): void => {
    seen.add(item.id)
    for (const child of childrenOf.get(item.id) ?? []) if (!seen.has(child.id)) take(child)
  }
  for (const item of roots) take(item)
  for (const item of items) {
    if (seen.has(item.id)) continue
    const siblings = childrenOf.get(item.clusterId!)
    if (siblings) {
      const rest = siblings.filter((s) => s.id !== item.id)
      if (rest.length > 0) childrenOf.set(item.clusterId!, rest)
      else childrenOf.delete(item.clusterId!)
    }
    roots.push(item)
    take(item)
  }

  return { roots, childrenOf }
}
