import { describe, expect, it } from 'vitest'
import { agendaBlocks, type AgendaItem } from './agenda-items'

/**
 * The paths this walker produces are what every error message from
 * apply_agenda points at, so they are fixed here before anything uses them.
 * A path that does not lead to the value a model sent is worse than no path.
 */
const mod = (typeKey = 'break') => ({ typeKey })
const cluster = (children: { typeKey: string }[] = []): AgendaItem => ({
  kind: 'cluster',
  children,
})
const breakout = (strands: number[]): AgendaItem => ({
  kind: 'breakout',
  children: strands.map((n, i) => ({
    title: `Strang ${i + 1}`,
    children: Array.from({ length: n }, () => mod()),
  })),
})

describe('agendaBlocks', () => {
  const cases: [string, AgendaItem[], string[]][] = [
    ['a module at day level', [{ kind: 'module', ...mod() }], ['items[0]']],
    [
      'a cluster with two blocks',
      [cluster([mod(), mod()])],
      ['items[0].children[0]', 'items[0].children[1]'],
    ],
    ['a cluster with no children', [cluster()], []],
    [
      'a breakout, two strands of two',
      [breakout([2, 2])],
      [
        'items[0].children[0].children[0]',
        'items[0].children[0].children[1]',
        'items[0].children[1].children[0]',
        'items[0].children[1].children[1]',
      ],
    ],
    ['a breakout with an empty strand', [breakout([0, 1])], ['items[0].children[1].children[0]']],
    ['a breakout with no strands at all', [breakout([])], []],
    [
      'a mixed day keeps every index straight',
      [{ kind: 'module', ...mod() }, breakout([1]), cluster([mod()])],
      ['items[0]', 'items[1].children[0].children[0]', 'items[2].children[0]'],
    ],
    ['nothing', [], []],
  ]

  it.each(cases)('%s', (_name, items, paths) => {
    expect([...agendaBlocks(items)].map((b) => b.at)).toEqual(paths)
  })

  it('hands back the block itself, not just where it was', () => {
    const items: AgendaItem[] = [breakout([1])]
    expect([...agendaBlocks(items)][0]?.block).toEqual({ typeKey: 'break' })
  })
})
