import { fireEvent, screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { OverlapWarning, TimeCell } from './time-cell'

const entry = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  startMinute: 780,
  endMinute: 795,
  durationMinutes: 15,
  pinned: false,
  conflict: null,
  ...over,
})

describe('TimeCell', () => {
  it('renders a derived start time without announcing a pin', () => {
    render(<TimeCell entry={entry()} />)
    expect(screen.getByText('13:00')).toBeInTheDocument()
    expect(screen.queryByText(/fixiert/i)).not.toBeInTheDocument()
  })

  it('announces a pinned start to screen readers, not just with a colour and an icon', () => {
    render(<TimeCell entry={entry({ pinned: true })} />)
    expect(screen.getByText('Startzeit fixiert:')).toBeInTheDocument()
  })

  it('can hide the duration for cluster headers, whose duration is derived', () => {
    render(<TimeCell entry={entry()} showDuration={false} />)
    expect(screen.queryByText('15m')).not.toBeInTheDocument()
  })
})

/**
 * Free start times, and locking one down.
 *
 * A derived start is right until the room is booked for 14:00. From then on it
 * is a fact the rest of the day has to bend around -- so pinning adopts the
 * time the block already starts at, and nothing moves until the next edit.
 */
describe('pinning a start time', () => {
  it('offers no lock at all to a reader', () => {
    render(<TimeCell entry={entry()} />)
    expect(screen.queryByRole('button', { name: /fixier/i })).not.toBeInTheDocument()
  })

  it('adopts the time the block already starts at, so pinning moves nothing', async () => {
    const onPinChange = vi.fn()
    render(<TimeCell entry={entry()} editing={{ onPinChange, pinnedStartMinute: null }} />)

    await userEvent.click(screen.getByRole('button', { name: 'Startzeit fixieren' }))

    expect(onPinChange).toHaveBeenCalledWith(780)
  })

  it('lets the block float again', async () => {
    const onPinChange = vi.fn()
    render(
      <TimeCell
        entry={entry({ pinned: true })}
        editing={{ onPinChange, pinnedStartMinute: 780 }}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fixierung aufheben' }))

    expect(onPinChange).toHaveBeenCalledWith(null)
  })

  it('says which way the lock is pointing, rather than only drawing it', () => {
    render(
      <TimeCell
        entry={entry({ pinned: true })}
        editing={{ onPinChange: () => {}, pinnedStartMinute: 780 }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Fixierung aufheben' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('takes a new time from the field', async () => {
    const onPinChange = vi.fn()
    render(
      <TimeCell
        entry={entry({ pinned: true })}
        editing={{ onPinChange, pinnedStartMinute: 780 }}
      />,
    )

    // fireEvent rather than typing: a native time input emits one change with
    // the whole value, where userEvent would walk it digit by digit through a
    // controlled field whose parent does not re-render here.
    fireEvent.change(screen.getByLabelText('Fixierte Startzeit'), { target: { value: '14:30' } })

    expect(onPinChange).toHaveBeenLastCalledWith(870)
  })

  it('offers the time field only once the block is pinned', () => {
    render(
      <TimeCell entry={entry()} editing={{ onPinChange: () => {}, pinnedStartMinute: null }} />,
    )
    expect(screen.queryByLabelText('Fixierte Startzeit')).not.toBeInTheDocument()
  })
})

describe('OverlapWarning', () => {
  it('states the overlap in words rather than only colouring the row', () => {
    render(<OverlapWarning minutes={30} />)
    expect(screen.getByText(/überschneidet den vorherigen block um 30m/i)).toBeInTheDocument()
  })
})
