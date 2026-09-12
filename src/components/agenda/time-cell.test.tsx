import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import { describe, expect, it } from 'vitest'
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

describe('OverlapWarning', () => {
  it('states the overlap in words rather than only colouring the row', () => {
    render(<OverlapWarning minutes={30} />)
    expect(screen.getByText(/überschneidet den vorherigen block um 30m/i)).toBeInTheDocument()
  })
})
