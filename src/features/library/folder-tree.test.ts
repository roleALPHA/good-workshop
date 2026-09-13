import { describe, expect, it } from 'vitest'
import { sortFolderTree, type FlatFolder } from '@/domain/workshop/folder-order'
import { filterFolderTree, visibleFolders } from './folder-tree'

/**
 * What a search, and a folded branch, leave of the sidebar.
 */

const flat = (id: string, name: string, parentId: string | null = null): FlatFolder => ({
  id,
  name,
  parentId,
  ancestorIds: [],
})

describe('searching the folder tree', () => {
  /**
   *  Intern
   *    Archiv
   *  Kunden
   *    Acme
   *      Archiv
   *  Team
   */
  const tree = sortFolderTree([
    flat('k', 'Kunden'),
    flat('acme', 'Acme', 'k'),
    flat('arch', 'Archiv', 'acme'),
    flat('intern', 'Intern'),
    flat('intArch', 'Archiv', 'intern'),
    flat('team', 'Team'),
  ])

  it('returns the whole tree for an empty query', () => {
    expect(filterFolderTree(tree, '  ')).toEqual(tree)
  })

  it('keeps the path above every match, so a hit is never out of context', () => {
    expect(filterFolderTree(tree, 'acme').map((node) => node.id)).toEqual(['k', 'acme'])
  })

  it('finds every folder of that name, in tree order', () => {
    expect(filterFolderTree(tree, 'archiv').map((node) => node.id)).toEqual([
      'intern',
      'intArch',
      'k',
      'acme',
      'arch',
    ])
  })

  it('matches parts of a name, ignoring case and accents', () => {
    expect(filterFolderTree(tree, 'TEA').map((node) => node.id)).toEqual(['team'])
    expect(
      filterFolderTree(sortFolderTree([flat('o', 'Ötztal')]), 'otz').map((node) => node.id),
    ).toEqual(['o'])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterFolderTree(tree, 'gibt es nicht')).toEqual([])
  })
})

describe('a folded tree', () => {
  const tree = sortFolderTree([
    flat('k', 'Kunden'),
    flat('acme', 'Acme', 'k'),
    flat('arch', 'Archiv', 'acme'),
    flat('team', 'Team'),
  ])

  it('shows everything while nothing is folded', () => {
    expect(visibleFolders(tree, new Set()).map((node) => node.id)).toEqual([
      'k',
      'acme',
      'arch',
      'team',
    ])
  })

  it('hides the whole subtree of a folded folder, but not the folder itself', () => {
    expect(visibleFolders(tree, new Set(['k'])).map((node) => node.id)).toEqual(['k', 'team'])
  })

  it('keeps a folded folder folded inside an open parent', () => {
    expect(visibleFolders(tree, new Set(['acme'])).map((node) => node.id)).toEqual([
      'k',
      'acme',
      'team',
    ])
  })

  it('ignores folded ids that are not in the tree', () => {
    expect(visibleFolders(tree, new Set(['gone']))).toEqual(tree)
  })
})
