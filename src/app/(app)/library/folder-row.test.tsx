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

  it('offers nothing to somebody who may not tidy up', () => {
    show(false)
    expect(screen.queryByRole('button', { name: /Kunden/ })).not.toBeInTheDocument()
  })
})
