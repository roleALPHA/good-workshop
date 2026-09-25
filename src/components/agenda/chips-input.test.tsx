import { useState } from 'react'
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
      editLabel={(name) => `Material ${name} bearbeiten`}
      editFieldLabel={(name) => `Neuer Name für Material ${name}`}
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

/**
 * A chip that is already there.
 *
 * Until now the only way to fix a typo was to remove the entry and type the
 * whole thing again -- which also moved it to the end of the list. The name is
 * a button; pressing it turns that one chip into a field, in place.
 */

/** Holds the list, for the tests that need to see the result of two steps. */
function Harness({ initial, onChange }: { initial: string[]; onChange: (next: string[]) => void }) {
  const [values, setValues] = useState(initial)
  return (
    <ChipsInput
      values={values}
      onChange={(next) => {
        setValues(next)
        onChange(next)
      }}
      addLabel="Material hinzufügen"
      removeLabel={(name) => `Material ${name} entfernen`}
      editLabel={(name) => `Material ${name} bearbeiten`}
      editFieldLabel={(name) => `Neuer Name für Material ${name}`}
    />
  )
}

const live = (initial: string[]) => {
  const onChange = vi.fn()
  render(<Harness initial={initial} onChange={onChange} />)
  return { onChange }
}

const open = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: `Material ${name} bearbeiten` }))

const fieldFor = (name: string) =>
  screen.getByRole('textbox', { name: `Neuer Name für Material ${name}` })

describe('changing an entry that is already there', () => {
  it('opens the entry for editing when its name is pressed', async () => {
    setup(['Beamer'])
    await open('Beamer')
    const field = fieldFor('Beamer')
    expect(field).toHaveValue('Beamer')
    expect(field).toHaveFocus()
  })

  it('writes the changed text back where the entry stood', async () => {
    const { onChange } = setup(['Beamer', 'Marker'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), 'Flipchart{Enter}')
    expect(onChange).toHaveBeenCalledWith(['Flipchart', 'Marker'])
  })

  it('commits when focus leaves, like everything else in this editor', async () => {
    const { onChange } = setup(['Beamer', 'Marker'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), 'Flipchart')
    await userEvent.click(document.body)
    expect(onChange).toHaveBeenCalledWith(['Flipchart', 'Marker'])
  })

  it('leaves the entry as it was when Escape abandons the change', async () => {
    const { onChange } = setup(['Beamer'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), 'Versehen{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Material Beamer bearbeiten' })).toBeInTheDocument()
  })

  it('keeps the entry rather than storing a blank', async () => {
    const { onChange } = setup(['Beamer'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), '{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Material Beamer bearbeiten' })).toBeInTheDocument()
  })

  it('says nothing when the text did not change', async () => {
    const { onChange } = setup(['Beamer'])
    await open('Beamer')
    await userEvent.type(fieldFor('Beamer'), '{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('folds an entry renamed onto another one into it', async () => {
    const { onChange } = setup(['Beamer', 'Marker'])
    await open('Marker')
    await userEvent.clear(fieldFor('Marker'))
    await userEvent.type(fieldFor('Marker'), 'Beamer{Enter}')
    expect(onChange).toHaveBeenCalledWith(['Beamer'])
  })

  it('splits a comma-separated change in place', async () => {
    const { onChange } = setup(['Beamer', 'Klebeband'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), 'Beamer, Marker{Enter}')
    expect(onChange).toHaveBeenCalledWith(['Beamer', 'Marker', 'Klebeband'])
  })

  it('deletes a character on backspace instead of the chip', async () => {
    const { onChange } = setup(['Beamer'])
    await open('Beamer')
    await userEvent.type(fieldFor('Beamer'), '{Backspace}{Enter}')
    expect(onChange).toHaveBeenCalledWith(['Beame'])
  })

  it('hands focus back to the entry after a change', async () => {
    live(['Beamer'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), 'Flipchart{Enter}')
    expect(screen.getByRole('button', { name: 'Material Flipchart bearbeiten' })).toHaveFocus()
  })

  it('still offers the remove button beside the entry it is changing', async () => {
    setup(['Beamer'])
    await open('Beamer')
    expect(screen.getByRole('button', { name: 'Material Beamer entfernen' })).toBeInTheDocument()
  })

  it('removes the entry it is changing rather than renaming it first', async () => {
    const { onChange } = live(['Beamer', 'Marker'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), 'Flipchart')
    await userEvent.click(screen.getByRole('button', { name: 'Material Beamer entfernen' }))
    expect(onChange).toHaveBeenLastCalledWith(['Marker'])
  })

  it("commits the change when another chip's remove button is clicked", async () => {
    const { onChange } = live(['Beamer', 'Marker'])
    await open('Beamer')
    await userEvent.clear(fieldFor('Beamer'))
    await userEvent.type(fieldFor('Beamer'), 'Flipchart')
    await userEvent.click(screen.getByRole('button', { name: 'Material Marker entfernen' }))
    expect(onChange).toHaveBeenLastCalledWith(['Flipchart'])
  })
})
