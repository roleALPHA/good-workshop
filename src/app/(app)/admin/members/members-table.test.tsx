import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberRow } from '@/domain/tenant/members'
import { renderWithIntl } from '@/test/intl'

const removeMemberAction = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/server/actions/members', () => ({
  removeMemberAction: (...args: unknown[]) => removeMemberAction(...args),
  setMemberRoleAction: vi.fn(),
  setMemberStatusAction: vi.fn(),
}))

const { MembersTable } = await import('./members-table')

function person(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'm-leaving',
    email: 'weg@example.test',
    displayName: 'Wanda Weg',
    role: 'member',
    status: 'active',
    isSelf: false,
    owns: { workshops: 0, folders: 0 },
    ...overrides,
  }
}

const successor = person({ id: 'm-stay', email: 'bleibt@example.test', displayName: 'Bea Bleibt' })

async function openRemoval(user: ReturnType<typeof userEvent.setup>, name = 'Wanda Weg') {
  const row = screen.getByText(name).closest('li')!
  await user.click(within(row).getByRole('button', { name: 'Entfernen' }))
  return row
}

beforeEach(() => {
  removeMemberAction.mockReset()
  removeMemberAction.mockResolvedValue({ ok: true, data: {} })
})

describe('removing a member', () => {
  it('says what has to change hands before it asks who gets it', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <MembersTable members={[person({ owns: { workshops: 3, folders: 1 } }), successor]} />,
    )
    const row = await openRemoval(user)

    expect(within(row).getByText(/3 Workshops und 1 Ordner/)).toBeInTheDocument()
    expect(within(row).getByLabelText('Übernimmt')).toBeInTheDocument()
  })

  it('asks for no successor from somebody who owns nothing', async () => {
    const user = userEvent.setup()
    renderWithIntl(<MembersTable members={[person(), successor]} />)
    const row = await openRemoval(user)

    expect(within(row).getByText(/keine Workshops und keine Ordner/)).toBeInTheDocument()
    expect(within(row).queryByLabelText('Übernimmt')).not.toBeInTheDocument()
  })

  /**
   * The gate, and the reason this component has a test at all: the confirm
   * button is the only thing between a click and an irreversible delete.
   */
  it('stays shut until the address is typed exactly', async () => {
    const user = userEvent.setup()
    renderWithIntl(<MembersTable members={[person(), successor]} />)
    const row = await openRemoval(user)
    const confirm = within(row).getByRole('button', { name: 'Endgültig entfernen' })

    expect(confirm).toBeDisabled()
    await user.type(within(row).getByLabelText(/E-Mail-Adresse eintippen/), 'weg@example.tes')
    expect(confirm).toBeDisabled()

    await user.type(within(row).getByLabelText(/E-Mail-Adresse eintippen/), 't')
    expect(confirm).toBeEnabled()
  })

  it('stays shut while somebody owns something and no successor is chosen', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <MembersTable members={[person({ owns: { workshops: 1, folders: 0 } }), successor]} />,
    )
    const row = await openRemoval(user)
    await user.type(within(row).getByLabelText(/E-Mail-Adresse eintippen/), 'weg@example.test')

    const confirm = within(row).getByRole('button', { name: 'Endgültig entfernen' })
    expect(confirm).toBeDisabled()

    await user.selectOptions(within(row).getByLabelText('Übernimmt'), 'm-stay')
    expect(confirm).toBeEnabled()
  })

  it('sends null rather than an empty string when no successor was needed', async () => {
    const user = userEvent.setup()
    renderWithIntl(<MembersTable members={[person(), successor]} />)
    const row = await openRemoval(user)
    await user.type(within(row).getByLabelText(/E-Mail-Adresse eintippen/), 'weg@example.test')
    await user.click(within(row).getByRole('button', { name: 'Endgültig entfernen' }))

    expect(removeMemberAction).toHaveBeenCalledWith({ memberId: 'm-leaving', successorId: null })
  })

  /**
   * Offered, not hidden: somebody on leave is often the right person to inherit
   * a team's workshops. The server refuses it; the label says so first.
   */
  it('marks a disabled candidate instead of leaving them out', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <MembersTable
        members={[
          person({ owns: { workshops: 1, folders: 0 } }),
          person({
            id: 'm-off',
            email: 'aus@example.test',
            displayName: 'Otto Aus',
            status: 'disabled',
          }),
        ]}
      />,
    )
    const row = await openRemoval(user)

    const option = within(row).getByRole('option', { name: /Otto Aus/ })
    expect(option).toHaveTextContent('Abgeschaltet')
  })

  it('offers no removal for yourself', () => {
    renderWithIntl(<MembersTable members={[person({ isSelf: true }), successor]} />)
    const row = screen.getByText('Wanda Weg').closest('li')!
    expect(within(row).getByRole('button', { name: 'Entfernen' })).toBeDisabled()
  })
})
