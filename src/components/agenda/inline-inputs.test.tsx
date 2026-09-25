import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl as render } from '@/test/intl'
import { DescriptionInput, DurationInput, TitleInput } from './inline-inputs'

describe('the inline description field', () => {
  it('starts at one row, grows to its content and commits Markdown on Enter', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const height = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(240)

    render(<DescriptionInput value={null} label="Beschreibung" onCommit={onCommit} />)

    const field = screen.getByRole('textbox', { name: 'Beschreibung' })
    expect(field).toHaveAttribute('rows', '1')

    await user.type(field, '- Eins{Shift>}{Enter}{/Shift}- Zwei')
    expect(onCommit).not.toHaveBeenCalled()
    expect(field).toHaveStyle({ height: '240px' })

    await user.type(field, '{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0]?.[0].doc.content?.[0]?.type).toBe('bulletList')

    height.mockRestore()
  })

  it('removes an emptied description on blur', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <DescriptionInput
        value={{
          format: 'tiptap-doc-v1',
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alt' }] }],
          },
          text: 'Alt',
        }}
        label="Beschreibung"
        onCommit={onCommit}
      />,
    )

    await user.clear(screen.getByRole('textbox', { name: 'Beschreibung' }))
    await user.click(document.body)

    expect(onCommit).toHaveBeenCalledWith(undefined)
  })
})

describe('the fields a screen reader announces', () => {
  it('returns an emptied name rather than storing a row without one', async () => {
    const onCommit = vi.fn()
    render(<TitleInput value="Check-in" onCommit={onCommit} />)

    const field = screen.getByRole('textbox', { name: 'Titel' })
    await userEvent.clear(field)
    await userEvent.tab()

    expect(onCommit).not.toHaveBeenCalled()
    expect(field).toHaveValue('Check-in')
  })

  it('names the title in the language of the page', () => {
    // These two carried a hard-coded German aria-label in every language: an
    // English reader heard "Titel", a French one "Dauer". The visible text was
    // translated all along, which is why nobody saw it.
    render(<TitleInput value="Check-in" onCommit={() => {}} />, { locale: 'en' })
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument()
  })

  it('names the duration in the language of the page', () => {
    render(<DurationInput minutes={15} onCommit={() => {}} />, { locale: 'fr' })
    expect(screen.getByRole('textbox', { name: 'Durée' })).toBeInTheDocument()
  })

  it('keeps the German names German', () => {
    // The end-to-end suite aims at these by name, and so does everybody who
    // learned the interface in German.
    render(<TitleInput value="Check-in" onCommit={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Titel' })).toBeInTheDocument()
  })
})
