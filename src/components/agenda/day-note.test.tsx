import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { DayNote } from './day-note'

/**
 * The note that belongs to the day rather than to a block.
 *
 * Two rules worth holding: a reader sees it and cannot change it, and an empty
 * field clears the note instead of storing an empty string -- the column has a
 * default of `{}` and should come back to it.
 */

const withNote = (text?: string) => ({
  ...createDemoDay(),
  desc: text === undefined ? {} : { text },
})

describe('the day note', () => {
  it('shows nothing at all to a reader when there is no note', () => {
    const { container } = render(<DayNote doc={withNote()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the note to a reader, without a way to edit it', () => {
    render(<DayNote doc={withNote('Raum 2.14')} />)
    expect(screen.getByText('Raum 2.14')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('offers an editor a way in before there is anything to see', async () => {
    render(<DayNote doc={withNote()} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Notiz zum Tag/ }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('writes on blur rather than on every keystroke', async () => {
    const onChange = vi.fn()
    render(<DayNote doc={withNote('Alt')} onChange={onChange} />)

    const field = screen.getByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'Neu')
    // Still nothing: this goes to everybody with the day open.
    expect(onChange).not.toHaveBeenCalled()

    // focusOut, not blur: React binds onBlur to the focusout event, and a
    // plain blur event does not bubble and never reaches the handler. And not
    // tab() either -- the textarea is the only focusable element here.
    fireEvent.focusOut(field)
    expect(onChange).toHaveBeenCalledWith({ text: 'Neu' })
  })

  it('clears the note to an empty object rather than an empty string', async () => {
    const onChange = vi.fn()
    render(<DayNote doc={withNote('Weg damit')} onChange={onChange} />)

    const field = screen.getByRole('textbox')
    await userEvent.clear(field)
    fireEvent.focusOut(field)
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('says nothing when the text came back unchanged', async () => {
    const onChange = vi.fn()
    render(<DayNote doc={withNote('Unverändert')} onChange={onChange} />)

    const field = screen.getByRole('textbox')
    await userEvent.click(field)
    fireEvent.focusOut(field)
    expect(onChange).not.toHaveBeenCalled()
  })
})
