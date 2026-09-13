import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DayNav } from '@/features/agenda/days'
import { renderWithIntl as render } from '@/test/intl'

const createDayAction = vi.fn()
const moveDayAction = vi.fn()
const deleteDayAction = vi.fn()
const push = vi.fn()

vi.mock('@/server/actions/days', () => ({
  createDayAction: (...args: unknown[]) => createDayAction(...args),
  moveDayAction: (...args: unknown[]) => moveDayAction(...args),
  deleteDayAction: (...args: unknown[]) => deleteDayAction(...args),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: () => {} }) }))

const { DayTabs } = await import('./day-tabs')

/**
 * The days of a workshop, where the day is.
 *
 * A workshop runs over several days, and the tabs are how somebody gets from
 * one to the next. Adding, naming, dating, reordering and deleting a day all
 * happen here, in place -- and reordering has a way that needs no pointer,
 * because a drag is never the only way to do something.
 */

afterEach(() => {
  vi.clearAllMocks()
})

const nav = (overrides: Partial<DayNav> = {}): DayNav => ({
  workshopId: 'w-1',
  activeDayId: 'd-1',
  basePath: '/w/w-1/d/',
  days: [
    { id: 'd-1', title: 'Tag 1', date: null },
    { id: 'd-2', title: 'Tag 2', date: null },
    { id: 'd-3', title: 'Tag 3', date: null },
  ],
  parkedElsewhere: [],
  canManage: true,
  ...overrides,
})

const tabs = () => within(screen.getByRole('navigation', { name: 'Tage' }))
const tabNames = () =>
  tabs()
    .getAllByRole('link')
    .map((link) => link.textContent)

describe('the day tabs', () => {
  it('link every day and mark the one on screen, under the name it is being given', () => {
    render(<DayTabs nav={nav()} activeTitle="Auftakt" activeDate={null} />)

    expect(tabs().getByRole('link', { name: 'Auftakt' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('link', { name: 'Tag 2' })).toHaveAttribute('href', '/w/w-1/d/d-2')
    expect(tabNames()).toEqual(['Auftakt', 'Tag 2', 'Tag 3'])
  })

  it('stay out of the way of somebody reading a one-day workshop', () => {
    render(
      <DayTabs
        nav={nav({ canManage: false, days: [{ id: 'd-1', title: 'Tag 1', date: null }] })}
        activeTitle="Tag 1"
        activeDate={null}
      />,
    )
    expect(screen.queryByRole('navigation', { name: 'Tage' })).not.toBeInTheDocument()
  })

  it('add a day behind the last one and open it', async () => {
    createDayAction.mockResolvedValue({ ok: true, data: { dayId: 'd-4' } })
    render(<DayTabs nav={nav()} activeTitle="Tag 1" activeDate={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Workshoptag hinzufügen' }))

    expect(createDayAction).toHaveBeenCalledWith({ workshopId: 'w-1', title: 'Tag 4' })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/w-1/d/d-4'))
  })

  it('name and date the day on screen', async () => {
    const onRetitle = vi.fn()
    const onRedate = vi.fn()
    render(
      <DayTabs
        nav={nav()}
        activeTitle="Tag 1"
        activeDate="2026-10-01"
        onRetitle={onRetitle}
        onRedate={onRedate}
      />,
    )

    const name = screen.getByRole('textbox', { name: 'Name des Tags' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Kickoff{Enter}')
    expect(onRetitle).toHaveBeenCalledWith('Kickoff')

    const date = screen.getByLabelText('Datum des Tags')
    expect(date).toHaveValue('2026-10-01')
    fireEvent.change(date, { target: { value: '2026-10-02' } })
    expect(onRedate).toHaveBeenLastCalledWith('2026-10-02')
    fireEvent.change(date, { target: { value: '' } })
    expect(onRedate).toHaveBeenLastCalledWith(null)
  })

  it('move the day on screen without a pointer', async () => {
    moveDayAction.mockResolvedValue({ ok: true, data: { contentVersion: '2' } })
    render(<DayTabs nav={nav()} activeTitle="Tag 1" activeDate={null} />)

    expect(screen.getByRole('button', { name: 'Tag nach vorn' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Tag nach hinten' }))

    expect(moveDayAction).toHaveBeenCalledWith({ workshopId: 'w-1', dayId: 'd-1', afterId: 'd-2' })
    expect(tabNames()).toEqual(['Tag 2', 'Tag 1', 'Tag 3'])

    await userEvent.click(screen.getByRole('button', { name: 'Tag nach vorn' }))
    expect(moveDayAction).toHaveBeenLastCalledWith({
      workshopId: 'w-1',
      dayId: 'd-1',
      afterId: null,
    })
    expect(tabNames()).toEqual(['Tag 1', 'Tag 2', 'Tag 3'])
  })

  it('put the order back and say why when a move is refused', async () => {
    moveDayAction.mockResolvedValue({ ok: false, message: 'Jemand anderes war schneller.' })
    render(<DayTabs nav={nav()} activeTitle="Tag 1" activeDate={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Tag nach hinten' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Jemand anderes war schneller.')
    expect(tabNames()).toEqual(['Tag 1', 'Tag 2', 'Tag 3'])
  })

  it('delete a day only once it has been said what goes with it', async () => {
    deleteDayAction.mockResolvedValue({ ok: true, data: { remainingDayId: 'd-2' } })
    render(<DayTabs nav={nav()} activeTitle="Tag 1" activeDate={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Workshoptag löschen' }))
    expect(deleteDayAction).not.toHaveBeenCalled()
    expect(screen.getByText(/Geparkte Blöcke bleiben auf dem Parkplatz/)).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    expect(deleteDayAction).toHaveBeenCalledWith({ workshopId: 'w-1', dayId: 'd-1' })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/w-1/d/d-2'))
  })

  it('offer no way to delete the last day', () => {
    render(
      <DayTabs
        nav={nav({ days: [{ id: 'd-1', title: 'Tag 1', date: null }] })}
        activeTitle="Tag 1"
        activeDate={null}
      />,
    )
    expect(screen.getByRole('button', { name: 'Workshoptag hinzufügen' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Workshoptag löschen' })).not.toBeInTheDocument()
  })

  it('offer a reader the days and nothing to change about them', () => {
    render(<DayTabs nav={nav({ canManage: false })} activeTitle="Tag 1" activeDate={null} />)

    expect(tabNames()).toEqual(['Tag 1', 'Tag 2', 'Tag 3'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
