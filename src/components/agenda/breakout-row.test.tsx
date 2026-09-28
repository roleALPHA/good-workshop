import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduleEntry } from '@/domain/schedule/types'
import type { ClusterDto, ModuleTypeDto } from '@/domain/agenda/types'
import { BreakoutRow, type BreakoutEditing } from './breakout-row'
import { TrackColumn } from './track-column'

/**
 * What a breakout says about itself.
 *
 * The geometry alone cannot carry "these run at the same time": on a phone the
 * strands are stacked, and past the fit width they wrap into a second row. So
 * every assertion here is about the WORDS -- the count, the "at the same time",
 * the "longest strand", the position of each strand.
 */
const breakout: ClusterDto = {
  id: 'bo',
  parentClusterId: null,
  mode: 'parallel',
  title: 'Drei Räume',
  color: 'cyan',
  pinnedStartMinute: null,
  collapsed: false,
  targetDurationMinutes: null,
  order: 0,
}

const strand = (id: string, title: string): ClusterDto => ({
  ...breakout,
  id,
  title,
  mode: 'sequential',
  parentClusterId: 'bo',
})

const entry: ScheduleEntry = {
  startMinute: 540,
  endMinute: 630,
  durationMinutes: 90,
  pinned: false,
  conflict: null,
  countsTowardsTotals: false,
}

const TYPES = [
  {
    id: 't1',
    key: 'break',
    name: 'Pause',
    color: 'slate',
    icon: '',
    defaultDurationMinutes: 15,
    countsAsContent: false,
  },
] as ModuleTypeDto[]

const editing = (over: Partial<BreakoutEditing> = {}): BreakoutEditing => ({
  onPinChange: vi.fn(),
  onTitleChange: vi.fn(),
  onColorChange: vi.fn(),
  ...over,
})

describe('BreakoutRow', () => {
  it('says how many strands there are, and that they are simultaneous, in words', () => {
    render(
      <BreakoutRow cluster={breakout} entry={entry} trackCount={3} blockCount={6}>
        <div />
      </BreakoutRow>,
    )
    const group = screen.getByRole('group', { name: /Drei Räume/ })
    expect(group).toHaveTextContent('3 Stränge, gleichzeitig')
  })

  it('labels its duration as the longest strand rather than a total', () => {
    render(
      <BreakoutRow cluster={breakout} entry={entry} trackCount={3} blockCount={6}>
        <div />
      </BreakoutRow>,
    )
    // "1h 30m" beside a count of three would read as the sum of the three.
    expect(screen.getByRole('group', { name: /Drei Räume/ })).toHaveTextContent(
      'längster Strang 1h 30m',
    )
  })

  it('names both numbers when it can be deleted, because it takes two levels with it', async () => {
    const onRemove = vi.fn()
    render(
      <BreakoutRow
        cluster={breakout}
        entry={entry}
        trackCount={3}
        blockCount={6}
        editing={editing({ onRemove })}
      >
        <div />
      </BreakoutRow>,
    )
    const button = screen.getByRole('button', { name: /Breakout „Drei Räume“/ })
    expect(button).toHaveAccessibleName(/3 Strängen und 6 Blöcken/)
    await userEvent.click(button)
    expect(onRemove).toHaveBeenCalled()
  })

  it('offers no field, no delete and no strand button without editing', () => {
    render(
      <BreakoutRow cluster={breakout} entry={entry} trackCount={2} blockCount={0}>
        <div />
      </BreakoutRow>,
    )
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('adds a strand from the last cell of the raster', async () => {
    const onAddTrack = vi.fn()
    render(
      <BreakoutRow
        cluster={breakout}
        entry={entry}
        trackCount={2}
        blockCount={0}
        editing={editing({ onAddTrack })}
      >
        <div />
      </BreakoutRow>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Strang hinzufügen' }))
    expect(onAddTrack).toHaveBeenCalled()
  })
})

describe('TrackColumn', () => {
  const strandEntry: ScheduleEntry = { ...entry, endMinute: 585, durationMinutes: 45 }

  it('carries its position in the text, so a stacked or wrapped column still reads right', () => {
    render(
      <TrackColumn
        cluster={strand('s2', 'B · Prozesse')}
        entry={strandEntry}
        index={1}
        count={3}
        blockCount={2}
      >
        <div />
      </TrackColumn>,
    )
    expect(screen.getByRole('group', { name: /B · Prozesse/ })).toHaveTextContent('Strang 2 von 3')
  })

  it('says an empty strand is empty rather than showing nothing', () => {
    render(
      <TrackColumn
        cluster={strand('s1', 'A')}
        entry={strandEntry}
        index={0}
        count={2}
        blockCount={0}
      >
        {null}
      </TrackColumn>,
    )
    expect(screen.getByText('Noch kein Block.')).toBeVisible()
  })

  it('names the strand on its add button, so three of them are three things', async () => {
    const onAddBlock = vi.fn()
    render(
      <TrackColumn
        cluster={strand('s1', 'A · Datenmodell')}
        entry={strandEntry}
        index={0}
        count={3}
        blockCount={0}
        editing={{ onTitleChange: vi.fn(), onColorChange: vi.fn(), onAddBlock, types: TYPES }}
      >
        {null}
      </TrackColumn>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Block in A · Datenmodell hinzufügen' }),
    )

    // Opens the same choice the day's picker offers, in the column the block
    // will land in. A button that silently created whichever type came first
    // would be permanent -- a block's type cannot be changed afterwards.
    await userEvent.click(screen.getByRole('button', { name: /Pause/ }))
    expect(onAddBlock).toHaveBeenCalledWith('break')
  })
})
