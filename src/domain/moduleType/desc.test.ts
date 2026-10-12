import { describe, expect, it } from 'vitest'
import { descChanges, setDescField, stringList } from './desc'

describe('writing one field of a block description', () => {
  it('leaves every other field alone', () => {
    expect(setDescField({ materials: ['Marker'] }, 'participation', 'pairs')).toEqual({
      materials: ['Marker'],
      participation: 'pairs',
    })
  })

  it('removes the key rather than storing an undefined the schema would reject', () => {
    const next = setDescField({ participation: 'pairs' }, 'participation', undefined)
    expect(next).not.toHaveProperty('participation')
  })

  it('does not mutate what it was given', () => {
    const before = { participation: 'pairs' }
    setDescField(before, 'participation', 'plenary')
    expect(before.participation).toBe('pairs')
  })
})

describe('reading an array field', () => {
  it('keeps the strings and drops whatever else ended up in there', () => {
    expect(stringList(['Marker', 3, null, 'Flipchart'])).toEqual(['Marker', 'Flipchart'])
  })

  it('treats a missing field as empty rather than throwing', () => {
    expect(stringList(undefined)).toEqual([])
  })
})

/**
 * What the editor sends when a field changes: that field, not the object.
 *
 * The row and the panel both hand up a whole `desc`. Writing it whole is what
 * let two people in two fields of one block overwrite each other, so only the
 * fields that differ from what the block holds go out.
 */
describe('descChanges', () => {
  it('names only the fields that differ', () => {
    expect(
      descChanges(
        { description: 'A', participation: 'plenary', materials: ['Flipchart'] },
        { description: 'B', participation: 'plenary', materials: ['Flipchart'] },
      ),
    ).toEqual({ description: 'B' })
  })

  it('names a removed field as undefined, so it is cleared', () => {
    const changes = descChanges({ description: 'A', notes: 'x' }, { description: 'A' })
    expect(changes).toEqual({ notes: undefined })
    expect(Object.keys(changes)).toEqual(['notes'])
  })

  it('compares lists and rich text by value, not by identity', () => {
    expect(
      descChanges(
        { materials: ['Flipchart'], description: { format: 'tiptap-doc-v1', text: 'A' } },
        { materials: ['Flipchart'], description: { format: 'tiptap-doc-v1', text: 'A' } },
      ),
    ).toEqual({})
  })
})
