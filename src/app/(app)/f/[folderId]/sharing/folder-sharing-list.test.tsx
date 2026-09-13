import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl as render } from '@/test/intl'
import { describe, expect, it, vi } from 'vitest'
import type { FolderSharingView } from '@/server/actions/folder-sharing'
import { FolderSharingList } from './folder-sharing-list'

/**
 * What the screen offers has to match what the server accepts.
 *
 * A folder viewer may hand on "read" and nothing else. Offering them "edit"
 * and letting `setFolderCollaborator` refuse would be a screen that lies -- the
 * person would pick it, wait, and get an error for a thing they were invited to
 * do. So the options come from `grantableRoles`, the same function the domain
 * checks against, and that is what these assertions pin.
 */

const actions = vi.hoisted(() => ({
  setFolderCollaboratorAction: vi.fn(),
  removeFolderCollaboratorAction: vi.fn(),
}))

vi.mock('@/server/actions/folder-sharing', () => actions)

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const person = (over: Partial<FolderSharingView['people'][number]> = {}) =>
  ({
    id: 'm-1',
    email: 'kim@example.test',
    displayName: 'Kim',
    role: 'member',
    status: 'active',
    isSelf: false,
    access: 'none',
    inherited: null,
    ...over,
  }) as FolderSharingView['people'][number]

const list = (grantable: ('editor' | 'viewer')[], people = [person()]) =>
  render(<FolderSharingList folderId="f-1" grantable={grantable} people={people} />)

const selectOf = (email: string) => screen.getByRole('combobox', { name: new RegExp(email) })

const optionsOf = (email: string) =>
  within(selectOf(email))
    .getAllByRole('option')
    .map((o) => o.textContent)

describe('the folder sharing list', () => {
  it('offers both roles to somebody who holds edit', () => {
    list(['editor', 'viewer'])
    expect(optionsOf('kim@example.test')).toEqual(['Kein Zugriff', 'Lesen', 'Bearbeiten'])
  })

  it('offers only read to somebody who holds read', () => {
    list(['viewer'])
    // The whole point: no "Bearbeiten" for a viewer to pick and be refused.
    expect(optionsOf('kim@example.test')).toEqual(['Kein Zugriff', 'Lesen'])
  })

  it('offers no control at all to somebody who may hand on nothing', () => {
    list([], [person({ access: 'viewer' })])
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    // Still says what the state is, rather than showing an empty row.
    expect(screen.getByText('Lesen')).toBeInTheDocument()
  })

  it('names the creator rather than offering to change them', () => {
    list(['editor', 'viewer'], [person({ id: 'm-creator', access: 'creator' })])
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Angelegt')).toBeInTheDocument()
  })
})

/**
 * A grant on a folder above reaches this one. The screen used to show such a
 * colleague as "Kein Zugriff" -- while they could open everything here.
 */
describe('access inherited from a folder above', () => {
  const fromKunden = (role: 'owner' | 'editor' | 'viewer') => ({ role, folderName: 'Kunden' })

  it('shows it in place of "no access", which here would not be true', () => {
    list(['editor', 'viewer'], [person({ inherited: fromKunden('viewer') })])

    expect(optionsOf('kim@example.test')).toEqual(['Lesen · über Kunden', 'Lesen', 'Bearbeiten'])
    expect(selectOf('kim@example.test')).toHaveValue('inherit')
  })

  it('goes back to what is inherited by taking the grant on this folder away', async () => {
    actions.removeFolderCollaboratorAction.mockResolvedValue({ ok: true, data: null })
    list(['editor', 'viewer'], [person({ access: 'viewer', inherited: fromKunden('editor') })])

    expect(selectOf('kim@example.test')).toHaveValue('viewer')
    await userEvent.selectOptions(selectOf('kim@example.test'), 'inherit')

    expect(actions.removeFolderCollaboratorAction).toHaveBeenCalledWith({
      folderId: 'f-1',
      memberId: 'm-1',
    })
  })

  it('says where it comes from to somebody who may only look', () => {
    list([], [person({ inherited: fromKunden('editor') })])

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Bearbeiten · über Kunden')).toBeInTheDocument()
  })

  it('names whoever made the folder above rather than offering to change them', () => {
    list(['editor', 'viewer'], [person({ inherited: fromKunden('owner') })])

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Hat Kunden angelegt')).toBeInTheDocument()
  })
})
