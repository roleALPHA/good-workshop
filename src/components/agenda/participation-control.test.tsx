import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_BY_KEY } from '@/domain/moduleType/builtins'
import { localiseModuleType } from '@/domain/moduleType/localise'
import { findField, parseSchema } from '@/domain/moduleType/profile'
import { DEFAULT_LOCALE } from '@/i18n/config'
import { ParticipationBadge, ParticipationControl } from './participation-control'

/**
 * Sozialform, beside the clock.
 *
 * It is declared by all fifteen block types and was reachable only by
 * expanding a row, which for a facilitator's most-consulted field amounted to
 * not being there. What these tests hold onto is that it is never a picture
 * on its own: every state is also a word.
 */

const field = (() => {
  const localised = localiseModuleType(
    {
      name: 'Begrüßung',
      description: '',
      jsonSchema: BUILTIN_BY_KEY.admin!.jsonSchema,
      isSystem: true,
      systemKey: 'admin',
      customizedAt: null,
    },
    DEFAULT_LOCALE,
  )
  return findField(parseSchema(localised.jsonSchema), 'participation')!
})()

describe('the participation badge', () => {
  it('names the format in words, not only with an icon', () => {
    render(<ParticipationBadge field={field} value="small_groups" />)
    expect(screen.getByText('Kleingruppen')).toBeInTheDocument()
  })

  it('shows nothing at all when the block does not say', () => {
    const { container } = render(<ParticipationBadge field={field} value={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing for a value the schema does not know', () => {
    const { container } = render(<ParticipationBadge field={field} value="carousel" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the participation control', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /Sozialform/ }))

  it('announces the current value on the trigger, for anyone who cannot see the icon', () => {
    render(<ParticipationControl field={field} value="pairs" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Sozialform: Paare' })).toBeInTheDocument()
  })

  it('says so when nothing is set rather than leaving the button unnamed', () => {
    render(<ParticipationControl field={field} value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Sozialform: keine Angabe/ })).toBeInTheDocument()
  })

  it('opens in place and offers every format the schema declares', async () => {
    const user = userEvent.setup()
    render(<ParticipationControl field={field} value={undefined} onChange={() => {}} />)

    await open(user)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Plenum',
      'Kleingruppen',
      'Paare',
      'Einzelarbeit',
      'keine',
    ])
  })

  it('writes the value the schema uses, not the label', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ParticipationControl field={field} value={undefined} onChange={onChange} />)

    await open(user)
    await user.click(screen.getByRole('option', { name: 'Kleingruppen' }))

    expect(onChange).toHaveBeenCalledWith('small_groups')
  })

  it('clears the field when the current value is picked again', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ParticipationControl field={field} value="pairs" onChange={onChange} />)

    await open(user)
    await user.click(screen.getByRole('option', { name: 'Paare' }))

    // undefined, not '': an empty string is a value the schema would reject.
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('marks which option is the current one', async () => {
    const user = userEvent.setup()
    render(<ParticipationControl field={field} value="plenary" onChange={() => {}} />)

    await open(user)

    expect(screen.getByRole('option', { name: /Plenum/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Paare/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('closes on Escape and hands focus back, so the keyboard never gets stranded', async () => {
    const user = userEvent.setup()
    render(<ParticipationControl field={field} value={undefined} onChange={() => {}} />)

    await open(user)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sozialform/ })).toHaveFocus()
  })

  it('opens from the keyboard alone', async () => {
    const user = userEvent.setup()
    render(<ParticipationControl field={field} value={undefined} onChange={() => {}} />)

    await user.tab()
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})
