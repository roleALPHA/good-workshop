/**
 * The order of the folder tree.
 *
 * Siblings are always alphabetical. The tree could be ordered by hand once,
 * by dragging -- but folders belong to the tenant, several people tidy them
 * up, and "where somebody put it" is where nobody else looks. `position` is
 * still written on a move; nothing reads it for the tree any more.
 *
 * Pure: `listFolders` sorts with it, and it is tested without a database.
 */

export type FlatFolder = {
  id: string
  name: string
  parentId: string | null
  ancestorIds: string[]
}

/**
 * German, because the source language is -- and ignoring case and accents, so
 * "archiv" sits next to "Archiv" and "Ötztal" next to "Oben". Numeric, so
 * "Tag 10" follows "Tag 2" rather than "Tag 1".
 */
const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })

/** Tree order: every folder directly below its parent, siblings alphabetical. */
export function sortFolderTree<T extends FlatFolder>(rows: T[]): (T & { depth: number })[] {
  const byParent = new Map<string | null, T[]>()
  for (const row of rows) {
    const bucket = byParent.get(row.parentId)
    if (bucket) bucket.push(row)
    else byParent.set(row.parentId, [row])
  }

  const out: (T & { depth: number })[] = []
  const walk = (parentId: string | null, depth: number) => {
    const siblings = (byParent.get(parentId) ?? []).slice().sort(
      // By id when two names compare equal, so the order never flickers
      // between two loads of the same tree.
      (a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id),
    )
    for (const row of siblings) {
      out.push({ ...row, depth })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
