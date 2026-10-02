import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const revokeConnectionAction = vi.fn()
vi.mock('@/server/actions/tokens', () => ({
  revokeConnectionAction: (...args: unknown[]) => revokeConnectionAction(...args),
}))

const { ConnectionList } = await import('./connection-list')

/**
 * The OAuth clients somebody connected, and the button that ends one.
 *
 * The consent screen promised this place for months before it existed.
 */

const CLAUDE = {
  clientId: '0b5a3c7e-1d2f-4a6b-8c9d-0e1f2a3b4c5d',
  name: 'Claude',
  scopes: ['workshops:read', 'workshops:write'],
  connectedAt: new Date('2026-09-20T08:00:00Z'),
  lastUsedAt: new Date('2026-10-01T09:30:00Z'),
}

afterEach(() => revokeConnectionAction.mockReset())

describe('connected clients', () => {
  it('says so when nothing is connected', () => {
    renderWithIntl(<ConnectionList initial={[]} />)
    expect(screen.getByText('Noch kein Client per OAuth verbunden.')).toBeInTheDocument()
  })

  it('names each client with what it may do', () => {
    renderWithIntl(<ConnectionList initial={[CLAUDE]} />)
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText(/Workshops lesen/)).toBeInTheDocument()
  })

  it('ends a connection and takes it off the list', async () => {
    revokeConnectionAction.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()
    renderWithIntl(<ConnectionList initial={[CLAUDE]} />)

    await user.click(screen.getByRole('button', { name: 'Zugriff von Claude entziehen' }))

    expect(revokeConnectionAction).toHaveBeenCalledExactlyOnceWith({ clientId: CLAUDE.clientId })
    expect(await screen.findByRole('status')).toHaveTextContent('Claude hat keinen Zugriff mehr.')
    expect(screen.queryByRole('button', { name: /entziehen/ })).not.toBeInTheDocument()
  })

  it('keeps the client and says why when the server refuses', async () => {
    revokeConnectionAction.mockResolvedValue({
      ok: false,
      error: 'failed',
      messageKey: 'errors.failed',
      message: 'Das hat nicht geklappt. Versuch es noch einmal.',
    })
    const user = userEvent.setup()
    renderWithIntl(<ConnectionList initial={[CLAUDE]} />)

    await user.click(screen.getByRole('button', { name: 'Zugriff von Claude entziehen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.')
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })
})
