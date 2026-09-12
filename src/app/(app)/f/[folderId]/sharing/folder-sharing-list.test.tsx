import { screen, within } from '@testing-library/react'
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

vi.mock('@/server/actions/folder-sharing', () => ({
  setFolderCollaboratorAction: vi.fn(),
  removeFolderCollaboratorAction: vi.fn(),
}))

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
    ...over,
  }) as FolderSharingView['people'][number]

const list = (grantable: ('editor' | 'viewer')[], people = [person()]) =>
  render(<FolderSharingList folderId="f-1" grantable={grantable} people={people} />)

const optionsOf = (email: string) =>
  within(screen.getByRole('combobox', { name: new RegExp(email) }))
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
