import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const deleteOwnAccountAction = vi.fn()
vi.mock('@/server/actions/profile', () => ({
  deleteOwnAccountAction: (...args: unknown[]) => deleteOwnAccountAction(...args),
}))

const { DeleteAccount } = await import('./delete-account')

const colleagues = [{ id: 'm-bea', name: 'Bea Bleibt' }]

beforeEach(() => {
  deleteOwnAccountAction.mockReset()
  deleteOwnAccountAction.mockResolvedValue({ ok: false, message: 'Nein.' })
})

describe('deleting your own account', () => {
  it('stays shut until the address is typed exactly', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <DeleteAccount
        email="ich@example.test"
        owns={{ workshops: 0, folders: 0 }}
        colleagues={colleagues}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Konto löschen' }))
    const confirm = screen.getByRole('button', { name: 'Konto endgültig löschen' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(/E-Mail-Adresse eintippen/), 'ich@example.test')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(deleteOwnAccountAction).toHaveBeenCalledWith({ successorId: null })
  })

  it('asks who takes over the workshops, and sends that choice', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <DeleteAccount
        email="ich@example.test"
        owns={{ workshops: 2, folders: 1 }}
        colleagues={colleagues}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Konto löschen' }))
    expect(screen.getByText(/2 Workshops und 1 Ordner/)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/E-Mail-Adresse eintippen/), 'ich@example.test')
    const confirm = screen.getByRole('button', { name: 'Konto endgültig löschen' })
    expect(confirm).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Übernimmt'), 'm-bea')
    await user.click(confirm)
    expect(deleteOwnAccountAction).toHaveBeenCalledWith({ successorId: 'm-bea' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nein.')
  })
})
