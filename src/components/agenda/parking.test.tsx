import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DayDoc } from '@/domain/agenda/types'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import type { ParkedElsewhere } from '@/features/agenda/days'
import { renderWithIntl as render } from '@/test/intl'
import { ParkingArea } from './parking'

/**
 * One shelf for the whole workshop.
 *
 * A block set aside on the first day is an alternative for the second one too
 * -- so the shelf shows what is parked on every day, and bringing a block back
 * puts it into the day that is on screen, wherever it was parked.
 */

const withParked = (titles: string[]): DayDoc => {
  const doc = createDemoDay()
  return {
    ...doc,
    modules: doc.modules.map((m) => (titles.includes(m.title) ? { ...m, parked: true } : m)),
  }
}

const fromDayTwo: ParkedElsewhere = {
  id: 'p-1',
  dayId: 'day-2',
  title: 'Plan B aus Tag 2',
  durationMinutes: 40,
  moduleTypeId: 't',
}

const shelf = () => screen.getByRole('region', { name: /Geparkt/ })

describe('the parking area', () => {
  it('holds what is parked on this day and on the others, in one list', () => {
    render(<ParkingArea doc={withParked(['Druckpunkte'])} elsewhere={[fromDayTwo]} />)

    expect(shelf()).toHaveAccessibleName('Geparkt (2)')
    expect(within(shelf()).getByRole('article', { name: 'Druckpunkte' })).toBeVisible()
    expect(within(shelf()).getByRole('article', { name: 'Plan B aus Tag 2' })).toHaveTextContent(
      '40m',
    )
    expect(shelf()).toHaveTextContent('Gehört zum Workshop')
  })

  it('is there when only another day has something parked', () => {
    render(<ParkingArea doc={createDemoDay()} elsewhere={[fromDayTwo]} />)
    expect(within(shelf()).getByRole('article', { name: 'Plan B aus Tag 2' })).toBeVisible()
  })

  it('brings a block into the day on screen, wherever it was parked', async () => {
    const onUnpark = vi.fn()
    const onBringHere = vi.fn()
    render(
      <ParkingArea
        doc={withParked(['Druckpunkte'])}
        elsewhere={[fromDayTwo]}
        onUnpark={onUnpark}
        onBringHere={onBringHere}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Plan B aus Tag 2 zurück in den Ablauf' }),
    )
    expect(onBringHere).toHaveBeenCalledWith(fromDayTwo)

    await userEvent.click(screen.getByRole('button', { name: 'Druckpunkte zurück in den Ablauf' }))
    expect(onUnpark).toHaveBeenCalledWith(expect.any(String))
    expect(onBringHere).toHaveBeenCalledTimes(1)
  })

  it('offers nothing to move to somebody who cannot bring a block over', () => {
    // A guest editor: this day's shelf is in the document they may write, the
    // other days are not.
    render(
      <ParkingArea doc={withParked(['Druckpunkte'])} elsewhere={[fromDayTwo]} onUnpark={vi.fn()} />,
    )

    expect(
      screen.getByRole('button', { name: 'Druckpunkte zurück in den Ablauf' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Plan B aus Tag 2 zurück in den Ablauf' }),
    ).not.toBeInTheDocument()
  })
})
