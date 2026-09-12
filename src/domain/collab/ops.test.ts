import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { blocksOf, dayOf, seedFromDayDoc, toDayDoc } from './doc'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import {
  addClusterBlock,
  addModuleBlock,
  clearBlocks,
  moveBlock,
  patchBlock,
  removeBlock,
  setDayFields,
} from './ops'

/**
 * These operations have two callers -- a person dragging, and an LLM writing
 * through MCP -- so the cases that matter are the ones where the second caller
 * is careless in ways a mouse cannot be: a parent that does not exist, an
 * anchor that was deleted, a cluster asked to nest.
 */

function emptyDay(): Y.Doc {
  const doc = new Y.Doc()
  dayOf(doc).set('id', 'day-1')
  dayOf(doc).set('workshopId', 'w-1')
  dayOf(doc).set('startMinute', 540)
  return doc
}

const order = (doc: Y.Doc, parentId: string | null = null) =>
  toDayDoc(doc, {})!
    .modules.filter((m) => m.clusterId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((m) => m.title)

const add = (doc: Y.Doc, id: string, title: string, parentId: string | null = null) =>
  addModuleBlock(doc, id, { moduleTypeId: 't', title, durationMinutes: 30, parentId })

describe('addModuleBlock', () => {
  it('appends in call order', () => {
    const doc = emptyDay()
    add(doc, 'a', 'Erstes')
    add(doc, 'b', 'Zweites')
    add(doc, 'c', 'Drittes')
    expect(order(doc)).toEqual(['Erstes', 'Zweites', 'Drittes'])
  })

  it('appends into a cluster without disturbing the day level', () => {
    const doc = emptyDay()
    addClusterBlock(doc, 'k', { title: 'Warm-up' })
    add(doc, 'a', 'Drin', 'k')
    add(doc, 'b', 'Draußen')
    expect(order(doc, 'k')).toEqual(['Drin'])
    expect(order(doc)).toEqual(['Draußen'])
  })
})

describe('moveBlock', () => {
  it('places a block behind the named anchor', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    add(doc, 'b', 'B')
    add(doc, 'c', 'C')
    expect(moveBlock(doc, 'c', null, 'a')).toBe(true)
    expect(order(doc)).toEqual(['A', 'C', 'B'])
  })

  it('puts a block at the top when there is no anchor', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    add(doc, 'b', 'B')
    moveBlock(doc, 'b', null, null)
    expect(order(doc)).toEqual(['B', 'A'])
  })

  it('appends when the anchor is gone rather than failing the move', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    add(doc, 'b', 'B')
    expect(moveBlock(doc, 'a', null, 'weg')).toBe(true)
    expect(order(doc)).toEqual(['B', 'A'])
  })

  it('refuses a parent that does not exist', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    expect(moveBlock(doc, 'a', 'kein-cluster', null)).toBe(false)
    expect(order(doc)).toEqual(['A'])
  })

  it('refuses a block that does not exist', () => {
    expect(moveBlock(emptyDay(), 'weg', null, null)).toBe(false)
  })

  it('keeps a cluster at day level even when asked to nest it', () => {
    const doc = emptyDay()
    addClusterBlock(doc, 'k1', { title: 'Eins' })
    addClusterBlock(doc, 'k2', { title: 'Zwei' })
    expect(moveBlock(doc, 'k2', 'k1', null)).toBe(true)
    expect(blocksOf(doc).get('k2')!.get('parentId')).toBeNull()
  })
})

describe('removeBlock', () => {
  it('takes a cluster and its children together', () => {
    const doc = emptyDay()
    addClusterBlock(doc, 'k', { title: 'Warm-up' })
    add(doc, 'a', 'Drin', 'k')
    add(doc, 'b', 'Auch drin', 'k')
    add(doc, 'c', 'Draußen')

    expect(removeBlock(doc, 'k')).toBe(3)
    expect([...blocksOf(doc).keys()]).toEqual(['c'])
  })

  it('reports nothing removed for an unknown id', () => {
    expect(removeBlock(emptyDay(), 'weg')).toBe(0)
  })
})

describe('patchBlock', () => {
  it('writes only the fields it was given', () => {
    const doc = emptyDay()
    add(doc, 'a', 'Titel')
    patchBlock(doc, 'a', { desc: { note: 'x' } })
    patchBlock(doc, 'a', { durationMinutes: 45 })

    const block = blocksOf(doc).get('a')!
    expect(block.get('title')).toBe('Titel')
    expect(block.get('durationMinutes')).toBe(45)
    expect(block.get('desc')).toEqual({ note: 'x' })
  })

  it('reports a miss instead of creating a block', () => {
    const doc = emptyDay()
    expect(patchBlock(doc, 'weg', { title: 'X' })).toBe(false)
    expect(blocksOf(doc).size).toBe(0)
  })
})

describe('clearBlocks and setDayFields', () => {
  it('empties the day', () => {
    const doc = emptyDay()
    addClusterBlock(doc, 'k', { title: 'K' })
    add(doc, 'a', 'A', 'k')
    expect(clearBlocks(doc)).toBe(2)
    expect(blocksOf(doc).size).toBe(0)
  })

  it('moves the day start without touching the blocks', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    setDayFields(doc, { startMinute: 600 })
    expect(toDayDoc(doc, {})!.startMinute).toBe(600)
    expect(order(doc)).toEqual(['A'])
  })
})

describe('two writers', () => {
  it('merges an LLM append and a human edit without losing either', () => {
    // The whole reason MCP writes go through the room: these are two peers on
    // one document rather than two writers to one table.
    const human = emptyDay()
    add(human, 'a', 'Check-in')

    const llm = new Y.Doc()
    Y.applyUpdate(llm, Y.encodeStateAsUpdate(human))

    patchBlock(human, 'a', { durationMinutes: 20 })
    add(llm, 'b', 'Retro')

    Y.applyUpdate(human, Y.encodeStateAsUpdate(llm))
    Y.applyUpdate(llm, Y.encodeStateAsUpdate(human))

    for (const doc of [human, llm]) {
      expect(order(doc)).toEqual(['Check-in', 'Retro'])
      expect(blocksOf(doc).get('a')!.get('durationMinutes')).toBe(20)
    }
  })
})

describe('after seeding from the database', () => {
  it('can still append', () => {
    // Regression: the seed wrote zero-padded ordinals as sort keys. They sort
    // correctly and are not valid fractional keys, so the very next append --
    // a person clicking "+", or a model calling add_module -- threw.
    const doc = new Y.Doc()
    seedFromDayDoc(doc, createDemoDay())

    expect(() => add(doc, 'neu', 'Angehängt')).not.toThrow()
    expect(order(doc).at(-1)).toBe('Angehängt')
  })

  it('keeps the order the database had', () => {
    const source = createDemoDay()
    const doc = new Y.Doc()
    seedFromDayDoc(doc, source)

    const expected = source.modules
      .filter((m) => m.clusterId === null)
      .sort((a, b) => a.order - b.order)
      .map((m) => m.title)
    const dayLevel = toDayDoc(doc, {})!
      .modules.filter((m) => m.clusterId === null)
      .sort((a, b) => a.order - b.order)
      .map((m) => m.title)

    expect(dayLevel).toEqual(expected)
  })
})
