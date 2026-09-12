import { screen, waitFor } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyBlock } from './copy-block'

/**
 * A copy button is a promise, and the promise is the point: somebody dismisses
 * the panel believing the token is on their clipboard. So both halves are
 * asserted -- that the exact value goes across, and that a refusal does not
 * look like success.
 */

function stubClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  })
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>
}

afterEach(() => {
  vi.useRealTimers()
})

describe('a block that is there to be copied', () => {
  it('writes the value it shows, not a trimmed version of it', async () => {
    const writeText = stubClipboard(async () => {})
    const value = 'claude mcp add --transport http goodworkshop https://gw.example/api/mcp'

    render(<CopyBlock value={value} label="Befehl kopieren" />)
    await userEvent.click(screen.getByRole('button', { name: 'Befehl kopieren' }))

    expect(writeText).toHaveBeenCalledWith(value)
    expect(await screen.findByText('Kopiert')).toBeInTheDocument()
  })

  it('selects the text instead of claiming a copy the browser refused', async () => {
    stubClipboard(async () => {
      throw new Error('denied')
    })

    render(<CopyBlock value="gwp_abc" label="Token kopieren" />)
    await userEvent.click(screen.getByRole('button', { name: 'Token kopieren' }))

    // Claiming a copy that did not happen is the bug this guards: somebody
    // dismisses the panel on the strength of that word, and the token is gone.
    await waitFor(() => expect(screen.queryByText('Kopiert')).not.toBeInTheDocument())

    // What they get instead is the selection, so the next Ctrl+C still works.
    expect(window.getSelection()?.toString()).toBe('gwp_abc')
  })
})
