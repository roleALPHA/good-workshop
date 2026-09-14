import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { dayOf, toDayDoc } from './doc'
import { addClusterBlock, addModuleBlock, parkedModules, patchBlock, snapshotModule } from './ops'

/**
 * What a block takes with it when it leaves one day for another.
 *
 * A day is one shared document, so a block cannot simply change its day: it is
 * read out of one document and written into the next. Whatever this snapshot
 * forgets is lost on the way -- which is why it is asserted field by field.
 */

function emptyDay(): Y.Doc {
  const doc = new Y.Doc()
  dayOf(doc).set('id', 'day-1')
  dayOf(doc).set('workshopId', 'w-1')
  dayOf(doc).set('startMinute', 540)
  return doc
}

describe('snapshotModule', () => {
  it('carries everything that makes the block what it is', () => {
    const doc = emptyDay()
    addModuleBlock(doc, 'm', {
      moduleTypeId: 't',
      title: 'Plan B',
      durationMinutes: 45,
      pinnedStartMinute: 630,
      desc: { material: ['Flipchart'] },
    })
    patchBlock(doc, 'm', {
      parked: true,
      responsible: [
        { name: 'Mira', memberId: '0190a000-0000-7000-8000-000000000001' },
        { name: 'Frau Berg', memberId: null },
      ],
    })

    expect(snapshotModule(doc, 'm')).toEqual({
      moduleTypeId: 't',
      title: 'Plan B',
      durationMinutes: 45,
      pinnedStartMinute: 630,
      desc: { material: ['Flipchart'] },
      parked: true,
      responsible: [
        { name: 'Mira', memberId: '0190a000-0000-7000-8000-000000000001' },
        { name: 'Frau Berg', memberId: null },
      ],
    })
  })

  it('has nothing to say about a block that is not there', () => {
    expect(snapshotModule(emptyDay(), 'gone')).toBeNull()
  })

  it('does not treat a cluster as a block that could travel', () => {
    // A section is a shape of one day. Taking it to another would take its
    // children too, and nothing offers that.
    const doc = emptyDay()
    addClusterBlock(doc, 'k', { title: 'Warm-up' })
    expect(snapshotModule(doc, 'k')).toBeNull()
  })
})

describe('parkedModules', () => {
  it('lists the parked blocks of a day, in their order, and nothing else', () => {
    const doc = emptyDay()
    for (const [id, title] of [
      ['a', 'Erster'],
      ['b', 'Im Ablauf'],
      ['c', 'Dritter'],
    ] as const) {
      addModuleBlock(doc, id, { moduleTypeId: 't', title, durationMinutes: 10 })
    }
    patchBlock(doc, 'c', { parked: true })
    patchBlock(doc, 'a', { parked: true })

    expect(parkedModules(doc).map((m) => [m.id, m.title])).toEqual([
      ['a', 'Erster'],
      ['c', 'Dritter'],
    ])
  })
})

describe('addModuleBlock', () => {
  it('can put a block straight onto the shelf', () => {
    const doc = emptyDay()
    addModuleBlock(doc, 'm', {
      moduleTypeId: 't',
      title: 'Geparkt',
      durationMinutes: 10,
      parked: true,
    })
    expect(toDayDoc(doc, {})!.modules[0]).toMatchObject({ title: 'Geparkt', parked: true })
  })
})
