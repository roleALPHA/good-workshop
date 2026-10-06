import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { blocksOf, dayOf, seedFromDayDoc, toDayDoc } from './doc'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import {
  addBreakoutBlock,
  addClusterBlock,
  addModuleBlock,
  clearBlocks,
  moveBlock,
  patchBlock,
  removeBlock,
  setDayFields,
  siblings,
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

describe('adding at a position', () => {
  // Sections and day-level blocks share one sibling list, so the ids are read
  // off that list rather than off the modules alone.
  const level = (doc: Y.Doc, parentId: string | null = null) =>
    siblings(blocksOf(doc), parentId).map((s) => s.id)

  const addAfter = (
    doc: Y.Doc,
    id: string,
    afterId: string | null,
    parentId: string | null = null,
  ) =>
    addModuleBlock(doc, id, {
      moduleTypeId: 't',
      title: id,
      durationMinutes: 30,
      parentId,
      afterId,
    })

  it('puts a block behind the named sibling', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    add(doc, 'c', 'C')
    addAfter(doc, 'b', 'a')
    expect(level(doc)).toEqual(['a', 'b', 'c'])
  })

  it('puts a block at the top for afterId null, and at the end when it is left out', () => {
    const doc = emptyDay()
    add(doc, 'b', 'B')
    addAfter(doc, 'a', null)
    add(doc, 'c', 'C')
    expect(level(doc)).toEqual(['a', 'b', 'c'])
  })

  it('places a block inside a section', () => {
    const doc = emptyDay()
    addClusterBlock(doc, 'k', { title: 'Warm-up' })
    add(doc, 'x', 'X', 'k')
    add(doc, 'z', 'Z', 'k')
    addAfter(doc, 'y', 'x', 'k')
    addAfter(doc, 'w', null, 'k')
    expect(level(doc, 'k')).toEqual(['w', 'x', 'y', 'z'])
  })

  it('appends when the anchor is gone, like a move does', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    addAfter(doc, 'b', 'weg')
    expect(level(doc)).toEqual(['a', 'b'])
  })

  it('puts a section between two day-level blocks', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    add(doc, 'b', 'B')
    addClusterBlock(doc, 'k', { title: 'Mitte', afterId: 'a' })
    expect(level(doc)).toEqual(['a', 'k', 'b'])
  })

  it('puts a breakout at the named place and its strands in their own list', () => {
    const doc = emptyDay()
    add(doc, 'a', 'A')
    add(doc, 'b', 'B')
    addBreakoutBlock(doc, 'bo', {
      title: 'Räume',
      afterId: null,
      strands: [
        { id: 's1', title: 'Eins' },
        { id: 's2', title: 'Zwei' },
      ],
    })
    expect(level(doc)).toEqual(['bo', 'a', 'b'])
    expect(level(doc, 'bo')).toEqual(['s1', 's2'])
  })

  it('keeps working once the keys between two neighbours have grown long', () => {
    // Fifty inserts behind the same anchor force the sibling list to be
    // redistributed; the new block must still get the slot it asked for.
    const doc = emptyDay()
    add(doc, 'a', 'A')
    add(doc, 'z', 'Z')
    for (let i = 0; i < 60; i++) addAfter(doc, `n${i}`, 'a')
    const ids = level(doc)
    expect(ids[0]).toBe('a')
    expect(ids[1]).toBe('n59')
    expect(ids.at(-1)).toBe('z')
    expect(ids).toHaveLength(62)
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

  it('refuses to put a section inside a section, and leaves it where it was', () => {
    // Refused rather than quietly clamped to the day: a block that jumps
    // somewhere nobody aimed at is worse than a move that does not happen, and
    // the caller can now say so.
    const doc = emptyDay()
    addClusterBlock(doc, 'k1', { title: 'Eins' })
    addClusterBlock(doc, 'k2', { title: 'Zwei' })
    expect(moveBlock(doc, 'k2', 'k1', null)).toBe(false)
    expect(blocksOf(doc).get('k2')!.get('parentId')).toBeNull()
  })
})

describe('breakouts', () => {
  const emptyBreakout = () => {
    const doc = emptyDay()
    addBreakoutBlock(doc, 'bo', {
      title: 'Drei Räume',
      strands: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
    })
    return doc
  }

  it('creates a breakout with its strands in one go', () => {
    const blocks = blocksOf(emptyBreakout())
    expect(blocks.get('bo')!.get('mode')).toBe('parallel')
    expect(blocks.get('bo')!.get('parentId')).toBeNull()
    expect(blocks.get('s1')!.get('mode')).toBe('sequential')
    expect(blocks.get('s1')!.get('parentId')).toBe('bo')
    expect(blocks.get('s2')!.get('parentId')).toBe('bo')
  })

  it('gives the strands their own key space, starting over inside the breakout', () => {
    const blocks = blocksOf(emptyBreakout())
    const first = String(blocks.get('s1')!.get('position'))
    const second = String(blocks.get('s2')!.get('position'))
    // Lexicographic, like the ORDER BY the server uses -- not numeric.
    expect(first < second).toBe(true)
  })

  it('clamps a breakout back to the day when asked to nest it', () => {
    const doc = emptyBreakout()
    addClusterBlock(doc, 'inner', { title: 'Innen', mode: 'parallel', parentId: 'bo' })
    expect(blocksOf(doc).get('inner')!.get('parentId')).toBeNull()
  })

  it('refuses to hang a block on the breakout itself', () => {
    const doc = emptyBreakout()
    addModuleBlock(doc, 'm', { moduleTypeId: 't', title: 'Block', durationMinutes: 15 })
    expect(moveBlock(doc, 'm', 'bo', null)).toBe(false)
    expect(blocksOf(doc).get('m')!.get('parentId')).toBeNull()
  })

  it('takes a block into a strand', () => {
    const doc = emptyBreakout()
    addModuleBlock(doc, 'm', { moduleTypeId: 't', title: 'Block', durationMinutes: 15 })
    expect(moveBlock(doc, 'm', 's1', null)).toBe(true)
    expect(blocksOf(doc).get('m')!.get('parentId')).toBe('s1')
  })

  it('moves a strand to another breakout, and out to the day', () => {
    const doc = emptyBreakout()
    addBreakoutBlock(doc, 'bo2', { title: 'Zweiter', strands: [] })
    expect(moveBlock(doc, 's1', 'bo2', null)).toBe(true)
    expect(blocksOf(doc).get('s1')!.get('parentId')).toBe('bo2')
    expect(moveBlock(doc, 's1', null, null)).toBe(true)
    expect(blocksOf(doc).get('s1')!.get('parentId')).toBeNull()
  })

  it('refuses to put a strand inside a strand', () => {
    const doc = emptyBreakout()
    expect(moveBlock(doc, 's2', 's1', null)).toBe(false)
  })

  it('deletes a breakout with its strands and everything in them', () => {
    const doc = emptyBreakout()
    addModuleBlock(doc, 'm', { moduleTypeId: 't', title: 'Block', durationMinutes: 15 })
    moveBlock(doc, 'm', 's1', null)
    // 1 breakout + 2 strands + 1 block
    expect(removeBlock(doc, 'bo')).toBe(4)
    expect(blocksOf(doc).size).toBe(0)
  })

  it('does not hang when two clusters point at each other', () => {
    const doc = emptyDay()
    addClusterBlock(doc, 'a', { title: 'A' })
    addClusterBlock(doc, 'b', { title: 'B' })
    const blocks = blocksOf(doc)
    doc.transact(() => {
      blocks.get('a')!.set('parentId', 'b')
      blocks.get('b')!.set('parentId', 'a')
    })
    expect(removeBlock(doc, 'a')).toBe(2)
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

  it('keeps a parked block when its section is deleted, on the day level and still parked', () => {
    // The parking area belongs to the workshop, not to the section the block
    // was parked from. The delete button counts only the scheduled blocks, so
    // taking a parked one along would delete something nobody was told about.
    const doc = emptyDay()
    addClusterBlock(doc, 'k', { title: 'Warm-up' })
    add(doc, 'a', 'Im Ablauf', 'k')
    addModuleBlock(doc, 'p', {
      moduleTypeId: 't',
      title: 'Alternative',
      durationMinutes: 20,
      parentId: 'k',
      parked: true,
    })
    add(doc, 'c', 'Draußen')

    expect(removeBlock(doc, 'k')).toBe(2)
    const parked = blocksOf(doc).get('p')!
    expect(parked.get('parentId')).toBeNull()
    expect(parked.get('parked')).toBe(true)
    expect([...blocksOf(doc).keys()].sort()).toEqual(['c', 'p'])
  })

  it('keeps parked blocks from the strands of a deleted breakout', () => {
    const doc = emptyDay()
    addBreakoutBlock(doc, 'bo', {
      title: 'Gruppen',
      strands: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
    })
    add(doc, 'm', 'Block', 's1')
    addModuleBlock(doc, 'p', {
      moduleTypeId: 't',
      title: 'Geparkt',
      durationMinutes: 10,
      parentId: 's2',
      parked: true,
    })

    // 1 breakout + 2 strands + 1 scheduled block
    expect(removeBlock(doc, 'bo')).toBe(4)
    expect([...blocksOf(doc).keys()]).toEqual(['p'])
    expect(blocksOf(doc).get('p')!.get('parentId')).toBeNull()
  })

  it('still deletes a parked block that is itself the target', () => {
    const doc = emptyDay()
    addModuleBlock(doc, 'p', { moduleTypeId: 't', title: 'X', durationMinutes: 5, parked: true })
    expect(removeBlock(doc, 'p')).toBe(1)
    expect(blocksOf(doc).size).toBe(0)
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
