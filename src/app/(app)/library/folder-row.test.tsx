import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const moveFolderAction = vi.fn()
const deleteFolderAction = vi.fn()

vi.mock('@/server/actions/workshop', () => ({
  moveFolderAction: (...args: unknown[]) => moveFolderAction(...args),
  deleteFolderAction: (...args: unknown[]) => deleteFolderAction(...args),
}))

const { FolderRow } = await import('./folder-row')

/**
 * The sidebar row.
 *
 * The remove button carried its German name in the component for months: the
 * lint rule that guards against that keys on umlauts, and "Ordner X entfernen"
 * has none. This test is the guard the rule could not be.
 */

const TARGETS = [{ id: 'f-2', name: 'Anderswo', depth: 0 }]

const show = (canManage = true) =>
  renderWithIntl(
    <FolderRow
      id="f-1"
      name="Kunden"
      parentId={null}
      depth={0}
      active={false}
      canManage={canManage}
      targets={TARGETS}
    />,
  )

afterEach(() => {
  moveFolderAction.mockReset()
  deleteFolderAction.mockReset()
})

describe('a folder in the sidebar', () => {
  it('names its remove button from the catalog', () => {
    show()
    expect(screen.getByRole('button', { name: 'Ordner Kunden entfernen' })).toBeInTheDocument()
  })

  it('moves the folder to the chosen parent', async () => {
    moveFolderAction.mockResolvedValue({ ok: true, data: null })
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden verschieben' }))
    await userEvent.selectOptions(screen.getByLabelText('Verschieben nach'), 'f-2')

    expect(moveFolderAction).toHaveBeenCalledWith({ id: 'f-1', parentId: 'f-2' })
  })

  it('asks before it removes a folder', async () => {
    // The remove button sits in a bar that a keyboard reaches while it is
    // invisible. One Enter there used to unfile every workshop in the folder
    // and drop its sharing, with nothing to undo it.
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden entfernen' }))

    expect(deleteFolderAction).not.toHaveBeenCalled()
    expect(screen.getByText(/Workshops darin rücken/)).toBeInTheDocument()
  })

  it('removes it on the second, differently named button', async () => {
    deleteFolderAction.mockResolvedValue({ ok: true, data: null })
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden entfernen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ordner entfernen' }))

    expect(deleteFolderAction).toHaveBeenCalledWith({ id: 'f-1' })
  })

  it('lets go of the question again', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden entfernen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.queryByText(/Workshops darin rücken/)).not.toBeInTheDocument()
    expect(deleteFolderAction).not.toHaveBeenCalled()
  })

  it('offers nothing to somebody who may not tidy up', () => {
    show(false)
    expect(screen.queryByRole('button', { name: /Kunden/ })).not.toBeInTheDocument()
  })
})

describe('the row buttons while they are invisible', () => {
  it('take no clicks until the row is hovered or focused', () => {
    // Reported from use: the first click on a long folder name opened its
    // access page instead of selecting the folder, and selecting a folder often
    // took two clicks. Both are this bar: it lies over the end of the name, and
    // opacity alone leaves it hit-testable, so the click that reveals it also
    // lands on it.
    show()
    const bar = screen.getByRole('link', { name: /Zugriff/ }).parentElement!
    expect(bar.className).toContain('pointer-events-none')
    expect(bar.className).toContain('group-hover:pointer-events-auto')
    expect(bar.className).toContain('group-focus-within:pointer-events-auto')
  })
})

describe('a folder name too long for the sidebar', () => {
  // jsdom lays nothing out, so the name is made to overflow by hand.
  function overflow(by: number) {
    const name = screen.getByText('Kunden', { selector: '[data-folder-name]' })
    Object.defineProperty(name, 'clientWidth', { configurable: true, value: 100 })
    Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 100 + by })
  }

  it('shows the whole name on hover when it is cut off', async () => {
    show()
    overflow(40)

    await userEvent.hover(screen.getByRole('link', { name: 'Kunden' }))
    expect(screen.getByTestId('folder-name-tooltip')).toHaveTextContent('Kunden')

    await userEvent.unhover(screen.getByRole('link', { name: 'Kunden' }))
    expect(screen.queryByTestId('folder-name-tooltip')).not.toBeInTheDocument()
  })

  it('shows it on keyboard focus too', async () => {
    show()
    overflow(40)

    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Kunden' })).toHaveFocus()
    expect(screen.getByTestId('folder-name-tooltip')).toHaveTextContent('Kunden')
  })

  it('shows it when the fitting name slides under the row buttons', async () => {
    show()
    overflow(0)
    const name = screen.getByText('Kunden', { selector: '[data-folder-name]' })
    const actions = screen.getByRole('button', { name: 'Ordner Kunden entfernen' }).parentElement!
    name.getBoundingClientRect = () => DOMRect.fromRect({ x: 40, width: 100 })
    actions.getBoundingClientRect = () => DOMRect.fromRect({ x: 110, width: 90 })

    await userEvent.hover(screen.getByRole('link', { name: 'Kunden' }))
    expect(screen.getByTestId('folder-name-tooltip')).toHaveTextContent('Kunden')
  })

  it('stays out of the way when the name fits', async () => {
    show()
    overflow(0)

    await userEvent.hover(screen.getByRole('link', { name: 'Kunden' }))
    expect(screen.queryByTestId('folder-name-tooltip')).not.toBeInTheDocument()
  })
})
