import { describe, expect, it } from 'vitest'
import { resolveFolderDrop, resolveWorkshopDrop, ROOT_DROP_ID } from './drag'

/**
 * The drops that must not become requests.
 *
 * Letting go over nothing, and letting go over the place a thing already sits.
 * Both are what changing your mind mid-drag looks like.
 */

describe('dropping a workshop', () => {
  it.each([
    {
      name: 'onto a folder it is not in',
      folderId: null,
      overId: 'f-kunden',
      expected: { workshopId: 'w-1', folderId: 'f-kunden' },
    },
    {
      name: 'onto the folder it is already in',
      folderId: 'f-kunden',
      overId: 'f-kunden',
      expected: null,
    },
    {
      name: 'onto the top level, out of a folder',
      folderId: 'f-kunden',
      overId: ROOT_DROP_ID,
      expected: { workshopId: 'w-1', folderId: null },
    },
    {
      name: 'onto the top level while already loose',
      folderId: null,
      overId: ROOT_DROP_ID,
      expected: null,
    },
    { name: 'over nothing at all', folderId: 'f-kunden', overId: null, expected: null },
  ])('$name', ({ folderId, overId, expected }) => {
    expect(resolveWorkshopDrop({ id: 'w-1', folderId }, overId)).toEqual(expected)
  })
})

describe('dropping a folder', () => {
  it('asks for the move when the parent changes', () => {
    expect(
      resolveFolderDrop(
        { id: 'f-1', parentId: null },
        { afterId: 'f-0' },
        { parentId: 'f-9', afterId: null, valid: true },
      ),
    ).toEqual({ id: 'f-1', parentId: 'f-9', afterId: null })
  })

  it('asks for the move when only the order changes', () => {
    expect(
      resolveFolderDrop(
        { id: 'f-1', parentId: 'f-9' },
        { afterId: null },
        { parentId: 'f-9', afterId: 'f-2', valid: true },
      ),
    ).toEqual({ id: 'f-1', parentId: 'f-9', afterId: 'f-2' })
  })

  it('asks for nothing when it lands where it already is', () => {
    expect(
      resolveFolderDrop(
        { id: 'f-1', parentId: 'f-9' },
        { afterId: 'f-2' },
        { parentId: 'f-9', afterId: 'f-2', valid: true },
      ),
    ).toBeNull()
  })

  it('asks for nothing when the projection refused', () => {
    expect(
      resolveFolderDrop(
        { id: 'f-1', parentId: null },
        { afterId: null },
        { parentId: 'f-9', afterId: null, valid: false },
      ),
    ).toBeNull()
  })
})
