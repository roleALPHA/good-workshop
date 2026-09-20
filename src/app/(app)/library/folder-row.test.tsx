import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const moveFolderAction = vi.fn()
const deleteFolderAction = vi.fn()
const renameFolderAction = vi.fn()

vi.mock('@/server/actions/workshop', () => ({
  moveFolderAction: (...args: unknown[]) => moveFolderAction(...args),
  deleteFolderAction: (...args: unknown[]) => deleteFolderAction(...args),
  renameFolderAction: (...args: unknown[]) => renameFolderAction(...args),
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
  renameFolderAction.mockReset()
})

describe('a folder in the sidebar', () => {
  /** Everything but moving lives in the row menu, so a test opens it first. */
  const openMenu = () =>
    userEvent.click(screen.getByRole('button', { name: 'Mehr zu Ordner Kunden' }))

  it('names its remove entry from the catalog', async () => {
    show()
    await openMenu()
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
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden entfernen' }))

    expect(deleteFolderAction).not.toHaveBeenCalled()
    expect(screen.getByText(/Workshops darin rücken/)).toBeInTheDocument()
  })

  it('removes it on the second, differently named button', async () => {
    deleteFolderAction.mockResolvedValue({ ok: true, data: null })
    show()

    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden entfernen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ordner entfernen' }))

    expect(deleteFolderAction).toHaveBeenCalledWith({ id: 'f-1' })
  })

  it('lets go of the question again', async () => {
    show()
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden entfernen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.queryByText(/Workshops darin rücken/)).not.toBeInTheDocument()
    expect(deleteFolderAction).not.toHaveBeenCalled()
  })

  it('renames a folder from the row', async () => {
    // There was no way to rename a folder at all -- not in the sidebar, not
    // anywhere else. A folder named in a hurry stayed that way.
    renameFolderAction.mockResolvedValue({ ok: true, data: null })
    show()

    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden umbenennen' }))
    const field = screen.getByLabelText('Neuer Name für Kunden')
    await userEvent.clear(field)
    await userEvent.type(field, 'Kundschaft{Enter}')

    expect(renameFolderAction).toHaveBeenCalledWith({ id: 'f-1', name: 'Kundschaft' })
  })

  it('starts from the name it has, and lets go on Escape', async () => {
    show()
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Ordner Kunden umbenennen' }))
    expect(screen.getByLabelText('Neuer Name für Kunden')).toHaveValue('Kunden')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByLabelText('Neuer Name für Kunden')).not.toBeInTheDocument()
    expect(renameFolderAction).not.toHaveBeenCalled()
  })

  it('offers nothing to change to somebody who may not tidy up', async () => {
    // The menu is still there: a viewer may look at who else has access.
    show(false)
    await userEvent.click(screen.getByRole('button', { name: 'Mehr zu Ordner Kunden' }))

    expect(screen.getByRole('link', { name: /Zugriff/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /umbenennen/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /entfernen/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verschieben/ })).not.toBeInTheDocument()
  })
})

describe('the row menu', () => {
  const menu = () => screen.getByRole('button', { name: 'Mehr zu Ordner Kunden' })

  it('keeps one button in the row instead of four', () => {
    // Four buttons beside a name leave about five letters of a 240px sidebar.
    // Dragging needs a handle that is always there, so the move control stays;
    // everything else moves behind one button.
    show()
    expect(menu()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ordner Kunden verschieben' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Zugriff/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /entfernen/ })).not.toBeInTheDocument()
  })

  it('offers access, renaming and removing once it is open', async () => {
    show()
    await userEvent.click(menu())

    expect(screen.getByRole('link', { name: /Zugriff/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ordner Kunden umbenennen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ordner Kunden entfernen' })).toBeInTheDocument()
  })

  it('closes on Escape and gives the focus back', async () => {
    show()
    await userEvent.click(menu())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('link', { name: /Zugriff/ })).not.toBeInTheDocument()
    expect(menu()).toHaveFocus()
  })

  it('closes when something else is pressed', async () => {
    show()
    await userEvent.click(menu())
    await userEvent.click(document.body)

    expect(screen.queryByRole('link', { name: /Zugriff/ })).not.toBeInTheDocument()
  })
})

describe('the row buttons and the name', () => {
  it('do not overlap: the bar stands beside the name', () => {
    // Reported from use: clicking a long folder name opened its access page,
    // because the bar lay over the end of the name. Padding on the link was
    // tried and is not enough -- padding is inside the element's box, so the
    // name still answered those clicks.
    show()
    const bar = screen.getByRole('button', { name: 'Ordner Kunden verschieben' }).parentElement!
    expect(bar.className).not.toContain('absolute')
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
    const actions = screen.getByTestId('folder-row-actions')
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
