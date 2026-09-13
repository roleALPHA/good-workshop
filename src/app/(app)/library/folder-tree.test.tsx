import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FolderNode } from '@/domain/workshop/repo'
import { renderWithIntl } from '@/test/intl'

vi.mock('@/server/actions/workshop', () => ({
  moveFolderAction: vi.fn(),
  deleteFolderAction: vi.fn(),
}))

const { FolderTree } = await import('./folder-tree')

/**
 * The search above the folder tree.
 *
 * A tree of a few dozen folders is already more than a sidebar shows at once,
 * and the folder you want is usually one whose name you know.
 */

const node = (id: string, name: string, parent: FolderNode | null = null): FolderNode => ({
  id,
  name,
  parentId: parent?.id ?? null,
  depth: parent ? parent.depth + 1 : 0,
  ancestorIds: parent ? [...parent.ancestorIds, parent.id] : [],
})

const kunden = node('k', 'Kunden')
const acme = node('acme', 'Acme', kunden)
const team = node('team', 'Team')
const FOLDERS = [kunden, acme, team]

const show = () =>
  renderWithIntl(
    <FolderTree folders={FOLDERS} current={undefined} tagged={false} canManage={false} />,
  )

// A string name is matched exactly, so "Kunden" does not also find "Zugriff auf Ordner Kunden".
const folderLink = (name: string) => screen.queryByRole('link', { name })

// What is folded is remembered in the browser; no test may inherit another's.
afterEach(() => window.localStorage.clear())

describe('searching the folder tree', () => {
  it('narrows the tree to the matches and the folders above them', async () => {
    show()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Ordner durchsuchen' }), 'acm')

    expect(folderLink('Kunden')).toBeInTheDocument()
    expect(folderLink('Acme')).toBeInTheDocument()
    expect(folderLink('Team')).not.toBeInTheDocument()
    // The way back to everything stays, whatever the search says.
    expect(folderLink('Alle Workshops')).toBeInTheDocument()
  })

  it('says so when no folder matches', async () => {
    show()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Ordner durchsuchen' }), 'xyz')

    expect(screen.getByText('Kein Ordner passt zu „xyz“.')).toBeInTheDocument()
    expect(folderLink('Kunden')).not.toBeInTheDocument()
  })

  it('shows the whole tree again on Escape', async () => {
    show()
    const box = screen.getByRole('searchbox', { name: 'Ordner durchsuchen' })

    await userEvent.type(box, 'acm')
    await userEvent.keyboard('{Escape}')

    expect(box).toHaveValue('')
    expect(folderLink('Team')).toBeInTheDocument()
  })

  it('offers no search while there are no folders to search', () => {
    renderWithIntl(<FolderTree folders={[]} current={undefined} tagged={false} canManage={false} />)

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})

describe('folding the folder tree', () => {
  it('folds a folder away with its subfolders, and opens it again', async () => {
    show()

    const toggle = screen.getByRole('button', { name: 'Ordner Kunden zuklappen' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(toggle)
    expect(folderLink('Acme')).not.toBeInTheDocument()
    expect(folderLink('Kunden')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden aufklappen' }))
    expect(folderLink('Acme')).toBeInTheDocument()
  })

  it('offers no toggle on a folder without subfolders', () => {
    show()

    expect(screen.queryByRole('button', { name: /Team (zu|auf)klappen/ })).not.toBeInTheDocument()
  })

  it('remembers what was folded the next time the tree is drawn', async () => {
    const { unmount } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden zuklappen' }))
    unmount()

    show()

    expect(folderLink('Acme')).not.toBeInTheDocument()
  })

  it('still finds a folder inside a folded one', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden zuklappen' }))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Ordner durchsuchen' }), 'acm')

    expect(folderLink('Acme')).toBeInTheDocument()
  })
})
