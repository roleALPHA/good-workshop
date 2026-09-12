import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChipsInput } from './chips-input'

/**
 * Material, edited where it is read.
 *
 * The gesture is the one every chip input has -- type a word, press Enter, it
 * is in the list -- and, per the rule this editor is built on, leaving the box
 * commits too. Nothing here has a save button.
 */

const setup = (values: string[] = []) => {
  const onChange = vi.fn()
  render(
    <ChipsInput
      values={values}
      onChange={onChange}
      addLabel="Material hinzufügen"
      removeLabel={(name) => `Material ${name} entfernen`}
    />,
  )
  return { onChange, field: screen.getByLabelText('Material hinzufügen') }
}

describe('editing a list of chips', () => {
  it('adds what was typed when Enter is pressed', async () => {
    const { onChange, field } = setup()
    await userEvent.type(field, 'Flipchart{Enter}')
    expect(onChange).toHaveBeenCalledWith(['Flipchart'])
  })

  it('adds what is in the box when focus leaves, without a save button', async () => {
    const { onChange, field } = setup()
    await userEvent.type(field, 'Marker')
    await userEvent.click(document.body)
    expect(onChange).toHaveBeenCalledWith(['Marker'])
  })

  it('splits on commas, so a pasted list is not one long chip', async () => {
    const { onChange, field } = setup()
    await userEvent.type(field, 'Flipchart, Marker, Klebeband{Enter}')
    expect(onChange).toHaveBeenCalledWith(['Flipchart', 'Marker', 'Klebeband'])
  })

  it('keeps what is already there when something is added', async () => {
    const { onChange, field } = setup(['Beamer'])
    await userEvent.type(field, 'Marker{Enter}')
    expect(onChange).toHaveBeenCalledWith(['Beamer', 'Marker'])
  })

  it('says nothing at all when the same entry is added twice', async () => {
    const { onChange, field } = setup(['Beamer'])
    await userEvent.type(field, 'Beamer{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores an empty box rather than storing a blank', async () => {
    const { onChange, field } = setup()
    await userEvent.type(field, '   {Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('names the chip on its own remove button', async () => {
    const { onChange } = setup(['Beamer', 'Marker'])
    await userEvent.click(screen.getByRole('button', { name: 'Material Beamer entfernen' }))
    expect(onChange).toHaveBeenCalledWith(['Marker'])
  })

  it('takes the last chip back on backspace in an empty box', async () => {
    const { onChange, field } = setup(['Beamer', 'Marker'])
    await userEvent.type(field, '{Backspace}')
    expect(onChange).toHaveBeenCalledWith(['Beamer'])
  })

  it('leaves the list alone when Escape abandons a draft', async () => {
    const { onChange, field } = setup(['Beamer'])
    await userEvent.type(field, 'Versehen{Escape}')
    await userEvent.click(document.body)
    expect(onChange).not.toHaveBeenCalled()
  })
})
