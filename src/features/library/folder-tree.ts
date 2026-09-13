/**
 * What of the folder tree the sidebar shows: the rows a search leaves, and the
 * rows a folded branch hides.
 *
 * The order itself is the domain's (see domain/workshop/folder-order.ts); both
 * functions here take a tree already in that order and only take rows out.
 * Pure, no DOM.
 */

type TreeRow = { id: string; name: string; parentId: string | null }

/**
 * The folders whose name contains the query, with every folder above them.
 *
 * The path stays because a hit without it is ambiguous: two customers each
 * holding an "Archiv" is the ordinary case, not the exotic one.
 */
export function filterFolderTree<T extends TreeRow>(nodes: T[], query: string): T[] {
  const needle = normalise(query.trim())
  if (needle === '') return nodes

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const keep = new Set<string>()
  for (const node of nodes) {
    if (!normalise(node.name).includes(needle)) continue
    // A parent already kept has its own path kept too, so the climb stops there.
    for (let at: T | undefined = node; at && !keep.has(at.id);) {
      keep.add(at.id)
      at = at.parentId === null ? undefined : byId.get(at.parentId)
    }
  }
  return nodes.filter((node) => keep.has(node.id))
}

/**
 * The tree without what lies below a folded folder.
 *
 * One pass, because tree order puts every parent before its children: by the
 * time a row is reached, whether its parent is hidden or folded is known.
 */
export function visibleFolders<T extends TreeRow>(nodes: T[], folded: ReadonlySet<string>): T[] {
  if (folded.size === 0) return nodes
  const hidden = new Set<string>()
  return nodes.filter((node) => {
    if (node.parentId !== null && (folded.has(node.parentId) || hidden.has(node.parentId))) {
      hidden.add(node.id)
      return false
    }
    return true
  })
}

/** Lower case, accents stripped: "Ötztal" is found by "otz". */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('de')
}
