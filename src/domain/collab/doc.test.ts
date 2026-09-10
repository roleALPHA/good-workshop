import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { MODULE_TYPES_BY_ID } from '@/features/agenda/fixtures/module-types'
import { blocksOf, seedFromDayDoc, toDayDoc } from './doc'
import { flattenDay } from '@/features/agenda/flatten'

/**
 * Convergence, not correctness-in-isolation.
 *
 * Every test here does the same thing: two documents diverge, then exchange
 * updates in both directions, and the question is whether they end up
 * identical AND whether that shared result is what the two people meant.
 * A CRDT that converges on something nobody asked for is still a bug.
 */

function twoClients() {
  const a = new Y.Doc()
  seedFromDayDoc(a, createDemoDay())

  const b = new Y.Doc()
  // A second client joins by applying the first one's state, exactly as it
  // would over the wire.
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

  return { a, b }
}

/** Exchanges updates in both directions until both sides agree. */
function sync(a: Y.Doc, b: Y.Doc) {
  const fromA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b))
  const fromB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a))
  Y.applyUpdate(b, fromA)
  Y.applyUpdate(a, fromB)
}

const block = (doc: Y.Doc, id: string) => blocksOf(doc).get(id)!
const read = (doc: Y.Doc) => toDayDoc(doc, MODULE_TYPES_BY_ID)!
const shape = (doc: Y.Doc) =>
  flattenDay(read(doc)).map((row) => (row.depth === 1 ? `  ${row.id}` : row.id))

describe('seeding', () => {
  it('reproduces the day it was seeded from', () => {
    const doc = new Y.Doc()
    const source = createDemoDay()
    seedFromDayDoc(doc, source)

    expect(shape(doc)).toEqual(
      flattenDay(source).map((row) => (row.depth === 1 ? `  ${row.id}` : row.id)),
    )
  })

  it('refuses to seed twice, so two clients arriving together cannot double the day', () => {
    const doc = new Y.Doc()
    const source = createDemoDay()
    seedFromDayDoc(doc, source)
    seedFromDayDoc(doc, source)

    expect(blocksOf(doc).size).toBe(source.clusters.length + source.modules.length)
  })
})

describe('concurrent edits', () => {
  it('keeps both changes when two people edit different fields of one block', () => {
    const { a, b } = twoClients()

    block(a, 'm-5').set('title', 'Spannungsfelder clustern')
    block(b, 'm-5').set('durationMinutes', 45)
    sync(a, b)

    for (const doc of [a, b]) {
      const mod = read(doc).modules.find((m) => m.id === 'm-5')!
      expect(mod.title).toBe('Spannungsfelder clustern')
      expect(mod.durationMinutes).toBe(45)
    }
  })

  it('keeps both moves when two people move different blocks', () => {
    const { a, b } = twoClients()

    // A pulls a block out of its cluster, B moves an unrelated one.
    block(a, 'm-3').set('parentId', null)
    block(b, 'm-9').set('position', 'zz')
    sync(a, b)

    expect(shape(a)).toEqual(shape(b))
    expect(read(a).modules.find((m) => m.id === 'm-3')!.clusterId).toBeNull()
    expect(shape(a).at(-1)).toBe('m-9')
  })

  it('converges on one title when two people rename the same block', () => {
    const { a, b } = twoClients()

    block(a, 'm-1').set('title', 'Ankommen')
    block(b, 'm-1').set('title', 'Begrüßung')
    sync(a, b)

    // Last-write-wins per field, and both sides agree on which. One of the two
    // loses their edit -- that is the accepted trade for a single field, and it
    // is why descriptions use character-level merging instead.
    const titleA = read(a).modules.find((m) => m.id === 'm-1')!.title
    const titleB = read(b).modules.find((m) => m.id === 'm-1')!.title
    expect(titleA).toBe(titleB)
    expect(['Ankommen', 'Begrüßung']).toContain(titleA)
  })

  it('keeps both blocks when two people add one at the same time', () => {
    const { a, b } = twoClients()
    const before = blocksOf(a).size

    for (const [doc, id] of [
      [a, 'neu-a'],
      [b, 'neu-b'],
    ] as const) {
      const created = new Y.Map<unknown>()
      created.set('kind', 'module')
      // Deliberately the SAME sort key: this is the case an array-based model
      // gets wrong, where both inserts claim one index and one is lost.
      created.set('position', 'zz')
      created.set('parentId', null)
      created.set('title', id)
      created.set('moduleTypeId', 'mt-break')
      created.set('durationMinutes', 15)
      blocksOf(doc).set(id, created)
    }
    sync(a, b)

    expect(blocksOf(a).size).toBe(before + 2)
    expect(shape(a)).toEqual(shape(b))
    // Tie-broken by id, so both sides show the same order.
    expect(shape(a).slice(-2)).toEqual(['neu-a', 'neu-b'])
  })

  it('survives a move and an edit of the same block at once', () => {
    const { a, b } = twoClients()

    block(a, 'm-2').set('parentId', null)
    block(b, 'm-2').set('title', 'Spielregeln')
    sync(a, b)

    const mod = read(a).modules.find((m) => m.id === 'm-2')!
    expect(mod.clusterId).toBeNull()
    expect(mod.title).toBe('Spielregeln')
    expect(shape(a)).toEqual(shape(b))
  })

  it('lets one person delete while the other edits, without resurrecting the block', () => {
    const { a, b } = twoClients()

    blocksOf(a).delete('m-9')
    block(b, 'm-9').set('title', 'Kaffee und Kuchen')
    sync(a, b)

    // Deletion wins over a concurrent field edit in Yjs. Worth pinning down:
    // the alternative -- an edit resurrecting a deleted block -- is far more
    // confusing to a user than losing a rename.
    expect(blocksOf(a).has('m-9')).toBe(false)
    expect(shape(a)).toEqual(shape(b))
  })

  it('agrees on the day start when both change it', () => {
    const { a, b } = twoClients()

    a.getMap('day').set('startMinute', 480)
    b.getMap('day').set('startMinute', 600)
    sync(a, b)

    expect(read(a).startMinute).toBe(read(b).startMinute)
  })
})

describe('offline and reconnect', () => {
  it('merges a batch of changes made while disconnected', () => {
    const { a, b } = twoClients()

    // B works offline for a while.
    block(b, 'm-4').set('durationMinutes', 60)
    block(b, 'm-4').set('title', 'Druckpunkte vertiefen')
    blocksOf(b).delete('m-11')

    // A keeps working in the meantime.
    block(a, 'm-1').set('durationMinutes', 20)

    sync(a, b)

    expect(shape(a)).toEqual(shape(b))
    const merged = read(a)
    expect(merged.modules.find((m) => m.id === 'm-4')!.durationMinutes).toBe(60)
    expect(merged.modules.find((m) => m.id === 'm-1')!.durationMinutes).toBe(20)
    expect(merged.modules.some((m) => m.id === 'm-11')).toBe(false)
  })

  it('is order-independent: applying updates in the other sequence gives the same result', () => {
    const { a, b } = twoClients()
    const c = new Y.Doc()
    Y.applyUpdate(c, Y.encodeStateAsUpdate(a))

    block(a, 'm-5').set('title', 'Erst A')
    block(b, 'm-6').set('durationMinutes', 25)

    const updateA = Y.encodeStateAsUpdate(a)
    const updateB = Y.encodeStateAsUpdate(b)

    // Same two updates, opposite order.
    Y.applyUpdate(c, updateB)
    Y.applyUpdate(c, updateA)
    sync(a, b)

    expect(shape(c)).toEqual(shape(a))
    expect(read(c).modules.find((m) => m.id === 'm-5')!.title).toBe('Erst A')
    expect(read(c).modules.find((m) => m.id === 'm-6')!.durationMinutes).toBe(25)
  })
})
