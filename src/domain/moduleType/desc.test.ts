import { describe, expect, it } from 'vitest'
import { setDescField, stringList } from './desc'

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
