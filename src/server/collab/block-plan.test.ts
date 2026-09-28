import { describe, expect, it } from 'vitest'
import type { RawBlock } from '@/domain/collab/doc'
import { planBlocks } from './block-plan'

const base: Omit<RawBlock, 'id' | 'kind' | 'parentId' | 'mode' | 'moduleTypeId'> = {
  position: 'a0',
  title: 'x',
  durationMinutes: 15,
  pinnedStartMinute: null,
  color: null,
  desc: {},
  parked: false,
  responsible: [],
}

const section = (id: string, parentId: string | null = null): RawBlock => ({
  ...base,
  id,
  kind: 'cluster',
  mode: 'sequential',
  parentId,
  moduleTypeId: null,
})

const breakout = (id: string, parentId: string | null = null): RawBlock => ({
  ...section(id, parentId),
  mode: 'parallel',
})

const block = (id: string, parentId: string | null = null): RawBlock => ({
  ...base,
  id,
  kind: 'module',
  mode: 'sequential',
  parentId,
  moduleTypeId: 'mt-1',
})

/**
 * The clamping table. Read it as: "the document says X, the tables get Y."
 *
 * Every row that rescues is a row where the document held a shape the schedule
 * has no meaning for. None of them may throw -- one bad block must not stop a
 * whole day being written for everyone in the room.
 */
type Expected = {
  roots?: string[]
  strands?: string[]
  modules?: [string, string | null][]
  rescued?: string[]
}

describe('planBlocks', () => {
  const cases: [string, RawBlock[], Expected][] = [
    ['a breakout on the day stays a root', [breakout('bo')], { roots: ['bo'] }],
    ['a section on the day stays a root', [section('c')], { roots: ['c'] }],
    [
      'a sequential cluster under a breakout is a strand',
      [breakout('bo'), section('s', 'bo')],
      { roots: ['bo'], strands: ['s'] },
    ],
    [
      'a breakout under a breakout loses its parent',
      [breakout('bo'), breakout('inner', 'bo')],
      { roots: ['bo', 'inner'], rescued: ['inner'] },
    ],
    [
      'a section under a section loses its parent',
      [section('c'), section('inner', 'c')],
      { roots: ['c', 'inner'], rescued: ['inner'] },
    ],
    [
      'a cluster whose parent is a module loses it',
      [block('m'), section('c', 'm')],
      { roots: ['c'], rescued: ['c'] },
    ],
    [
      'a cluster whose parent is not here loses it',
      [section('c', 'gone')],
      { roots: ['c'], rescued: ['c'] },
    ],
    [
      'a cluster pointing at itself loses it',
      [breakout('x', 'x')],
      { roots: ['x'], rescued: ['x'] },
    ],
    ['a block on the day stays on the day', [block('m')], { modules: [['m', null]] }],
    [
      'a block in a section stays in it',
      [section('c'), block('m', 'c')],
      { modules: [['m', 'c']] },
    ],
    [
      'a block in a strand stays in it',
      [breakout('bo'), section('s', 'bo'), block('m', 's')],
      { modules: [['m', 's']] },
    ],
    [
      'a block hanging on a breakout falls to the day',
      [breakout('bo'), block('m', 'bo')],
      { modules: [['m', null]], rescued: ['m'] },
    ],
    [
      'a block whose parent is a module falls to the day',
      [block('a'), block('b', 'a')],
      {
        modules: [
          ['a', null],
          ['b', null],
        ],
        rescued: ['b'],
      },
    ],
    [
      'a block whose parent is not here falls to the day',
      [block('m', 'gone')],
      { modules: [['m', null]], rescued: ['m'] },
    ],
  ]

  it.each(cases)('%s', (_name, blocks, expected) => {
    const plan = planBlocks(blocks)
    if (expected.roots) expect(plan.roots.map((r) => r.id)).toEqual(expected.roots)
    if (expected.strands) expect(plan.strands.map((r) => r.id)).toEqual(expected.strands)
    if (expected.modules) {
      expect(plan.modules.map((m) => [m.id, m.clusterId])).toEqual(expected.modules)
    }
    expect(plan.rescued.map((r) => r.id)).toEqual(expected.rescued ?? [])
  })

  it('drops a module without a type, as it always has', () => {
    const untyped: RawBlock = { ...block('m'), moduleTypeId: null }
    expect(planBlocks([untyped]).modules).toEqual([])
  })

  it('keeps a rescued strand’s own blocks inside it', () => {
    // The strand becomes a section of its own -- but it is still a cluster, so
    // its blocks have somewhere to be. Losing them here would turn "the
    // breakout went away" into "the work in it went away".
    const plan = planBlocks([section('s', 'gone'), block('m', 's')])
    expect(plan.roots.map((r) => r.id)).toEqual(['s'])
    expect(plan.modules.map((m) => [m.id, m.clusterId])).toEqual([['m', 's']])
  })
})
