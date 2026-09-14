import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl as render } from '@/test/intl'
import type { Responsible } from '@/domain/agenda/responsible'
import { ResponsibleInput, ResponsibleList } from './responsible'

/**
 * Who answers for a block: seen at a glance, changed where it is seen.
 */

const MIRA = '0190a000-0000-7000-8000-000000000001'
const JONAS = '0190a000-0000-7000-8000-000000000002'
const people = [
  { id: MIRA, name: 'Mira Schulz' },
  { id: JONAS, name: 'Jonas Weber' },
]

describe('reading who is responsible', () => {
  it('names every person, and says in words who is not a member', () => {
    render(
      <ResponsibleList
        people={[
          { name: 'Mira Schulz', memberId: MIRA, external: false },
          { name: 'Frau Berg', memberId: null, external: true },
        ]}
      />,
    )

    const list = screen.getByRole('list', { name: 'Verantwortlich' })
    const [mira, berg] = within(list).getAllByRole('listitem')
    expect(mira).toHaveTextContent('Mira Schulz')
    expect(mira).not.toHaveTextContent('extern')
    expect(berg).toHaveTextContent('Frau Berg')
    expect(berg).toHaveTextContent('extern')
  })

  it('shows nothing at all for a block nobody is assigned to', () => {
    render(<ResponsibleList people={[]} />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('assigning people', () => {
  const setup = (value: Responsible[] = []) => {
    const onChange = vi.fn()
    render(<ResponsibleInput value={value} people={people} onChange={onChange} />)
    return { onChange, field: screen.getByLabelText('Verantwortliche Person hinzufügen') }
  }

  it('makes a member of whoever is typed under a member name', async () => {
    const { onChange, field } = setup()
    await userEvent.type(field, 'mira schulz{Enter}')
    expect(onChange).toHaveBeenCalledWith([{ name: 'Mira Schulz', memberId: MIRA }])
  })

  it('takes somebody from outside the workspace by name alone', async () => {
    const { onChange, field } = setup()
    await userEvent.type(field, 'Frau Berg{Enter}')
    expect(onChange).toHaveBeenCalledWith([{ name: 'Frau Berg', memberId: null }])
  })

  it('adds to the people already there, and commits on leaving the field', async () => {
    const { onChange, field } = setup([{ name: 'Mira Schulz', memberId: MIRA }])
    await userEvent.type(field, 'Frau Berg')
    await userEvent.click(document.body)
    expect(onChange).toHaveBeenCalledWith([
      { name: 'Mira Schulz', memberId: MIRA },
      { name: 'Frau Berg', memberId: null },
    ])
  })

  it('says nothing when the same person is added twice', async () => {
    const { onChange, field } = setup([{ name: 'Mira Schulz', memberId: MIRA }])
    await userEvent.type(field, 'Mira Schulz{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('names the person on their own remove button', async () => {
    const { onChange } = setup([
      { name: 'Mira Schulz', memberId: MIRA },
      { name: 'Frau Berg', memberId: null },
    ])
    await userEvent.click(
      screen.getByRole('button', { name: 'Frau Berg als verantwortlich entfernen' }),
    )
    expect(onChange).toHaveBeenCalledWith([{ name: 'Mira Schulz', memberId: MIRA }])
  })

  it('shows a renamed member under their current name', () => {
    setup([{ name: 'Mira', memberId: MIRA }])
    expect(
      screen.getByRole('button', { name: 'Mira Schulz als verantwortlich entfernen' }),
    ).toBeInTheDocument()
  })

  it('offers only the members not yet assigned as suggestions', () => {
    setup([{ name: 'Mira Schulz', memberId: MIRA }])
    const options = [...document.querySelectorAll('datalist option')].map((o) =>
      o.getAttribute('value'),
    )
    expect(options).toEqual(['Jonas Weber'])
  })
})
