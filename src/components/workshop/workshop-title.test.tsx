import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const renameWorkshopAction = vi.fn()
const refresh = vi.fn()

vi.mock('@/server/actions/workshop', () => ({
  renameWorkshopAction: (...args: unknown[]) => renameWorkshopAction(...args),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const { WorkshopTitle } = await import('./workshop-title')

/**
 * The workshop's name above its agenda.
 *
 * A workshop could be renamed through MCP and nowhere in the interface: the
 * heading was static text, and the only way to fix a typo was to ask an AI
 * assistant. These hold onto the way back.
 */

afterEach(() => {
  renameWorkshopAction.mockReset()
  refresh.mockReset()
})

describe('the workshop title', () => {
  it('is plain text for somebody who may not change it', () => {
    renderWithIntl(<WorkshopTitle workshopId="w-1" title="Strategie Q4" canRename={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Strategie Q4' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /umbenennen/i })).not.toBeInTheDocument()
  })

  it('renames on Enter and refreshes the page', async () => {
    renameWorkshopAction.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()
    renderWithIntl(<WorkshopTitle workshopId="w-1" title="Strategie Q4" canRename />)

    await user.click(screen.getByRole('button', { name: 'Workshop Strategie Q4 umbenennen' }))
    const field = screen.getByRole('textbox', { name: 'Neuer Name für Strategie Q4' })
    expect(field).toHaveFocus()
    await user.clear(field)
    await user.type(field, 'Strategie Q1{Enter}')

    expect(renameWorkshopAction).toHaveBeenCalledExactlyOnceWith({
      workshopId: 'w-1',
      title: 'Strategie Q1',
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Strategie Q1' })).toBeVisible()
    expect(refresh).toHaveBeenCalled()
  })

  it('abandons the edit on Escape', async () => {
    const user = userEvent.setup()
    renderWithIntl(<WorkshopTitle workshopId="w-1" title="Strategie Q4" canRename />)

    await user.click(screen.getByRole('button', { name: 'Workshop Strategie Q4 umbenennen' }))
    await user.type(screen.getByRole('textbox'), ' neu{Escape}')

    expect(renameWorkshopAction).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Strategie Q4' })).toBeInTheDocument()
  })

  it('does not save an empty or unchanged name', async () => {
    const user = userEvent.setup()
    renderWithIntl(<WorkshopTitle workshopId="w-1" title="Strategie Q4" canRename />)

    await user.click(screen.getByRole('button', { name: 'Workshop Strategie Q4 umbenennen' }))
    await user.clear(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')

    expect(renameWorkshopAction).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Strategie Q4' })).toBeInTheDocument()
  })

  it('keeps the old name and says why when the server refuses', async () => {
    renameWorkshopAction.mockResolvedValue({
      ok: false,
      error: 'forbidden',
      messageKey: 'errors.forbidden',
      message: 'Dafür fehlt die Berechtigung.',
    })
    const user = userEvent.setup()
    renderWithIntl(<WorkshopTitle workshopId="w-1" title="Strategie Q4" canRename />)

    await user.click(screen.getByRole('button', { name: 'Workshop Strategie Q4 umbenennen' }))
    const field = screen.getByRole('textbox')
    await user.clear(field)
    await user.type(field, 'Anders{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.')
    expect(screen.getByRole('heading', { level: 1, name: 'Strategie Q4' })).toBeInTheDocument()
  })
})
