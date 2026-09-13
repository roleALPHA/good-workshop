import { describe, expect, it } from 'vitest'
import { sortFolderTree, type FlatFolder } from './folder-order'

/**
 * The order of the sidebar.
 *
 * Folders are always listed alphabetically. A manual order was possible once,
 * by dragging -- and in a tree that several people tidy up, "where I put it"
 * is where nobody else looks.
 */

const flat = (id: string, name: string, parentId: string | null = null): FlatFolder => ({
  id,
  name,
  parentId,
  ancestorIds: [],
})

describe('the folder tree order', () => {
  it('lists siblings alphabetically, whatever order they arrive in', () => {
    const tree = sortFolderTree([flat('z', 'Zukunft'), flat('a', 'Archiv'), flat('m', 'Marketing')])

    expect(tree.map((node) => node.name)).toEqual(['Archiv', 'Marketing', 'Zukunft'])
  })

  it('keeps every folder directly below its parent, sorted within it', () => {
    const tree = sortFolderTree([
      flat('k', 'Kunden'),
      flat('k2', 'Zeta AG', 'k'),
      flat('a', 'Archiv'),
      flat('k1', 'Acme', 'k'),
    ])

    expect(tree.map((node) => [node.name, node.depth])).toEqual([
      ['Archiv', 0],
      ['Kunden', 0],
      ['Acme', 1],
      ['Zeta AG', 1],
    ])
  })

  it('ignores case and sorts umlauts where a German reader expects them', () => {
    const tree = sortFolderTree([flat('1', 'zwei'), flat('2', 'Ötztal'), flat('3', 'Oben')])

    expect(tree.map((node) => node.name)).toEqual(['Oben', 'Ötztal', 'zwei'])
  })

  it('sorts numbers by value, so "Tag 10" comes after "Tag 2"', () => {
    const tree = sortFolderTree([flat('1', 'Tag 10'), flat('2', 'Tag 2')])

    expect(tree.map((node) => node.name)).toEqual(['Tag 2', 'Tag 10'])
  })
})
