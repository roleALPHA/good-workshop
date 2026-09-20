import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const createFolderAction = vi.fn()
vi.mock('@/server/actions/workshop', () => ({
  createFolderAction: (...args: unknown[]) => createFolderAction(...args),
}))
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
  useSearchParams: () => search,
}))

const { CreateFolder } = await import('./create-folder')

/**
 * Creating a folder, and creating it once.
 *
 * The field commits on Enter AND on blur, which is the right behaviour for a
 * field you can leave either way -- but pressing Enter closes it, so the blur
 * that follows used to fire a second, identical create. The second one hits the
 * unique index on (parent, name) and fails; the server log filled with insert
 * errors for folders that had, in fact, been created.
 */

afterEach(() => {
  createFolderAction.mockReset()
  search = new URLSearchParams()
})

describe('creating a folder', () => {
  it('sends exactly one request when Enter is pressed', async () => {
    // The request is left hanging on purpose. In a browser the blur that
    // follows Enter fires while the first create is still in flight, so the
    // field is still mounted and its handler still armed -- resolving the mock
    // immediately closes the field first and hides the bug entirely.
    let settle = (_: unknown) => {}
    createFolderAction.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      }),
    )

    renderWithIntl(<CreateFolder parentId={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ordner' }))
    const field = screen.getByLabelText('Name des Ordners')
    await userEvent.type(field, 'Neuer Ordner')

    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.focusOut(field)

    expect(createFolderAction).toHaveBeenCalledTimes(1)
    expect(createFolderAction).toHaveBeenCalledWith({ name: 'Neuer Ordner', parentId: null })

    settle({ ok: true, data: { id: 'f1' } })
  })

  it('still commits when the field is left without pressing Enter', async () => {
    createFolderAction.mockResolvedValue({ ok: true, data: { id: 'f2' } })
    renderWithIntl(<CreateFolder parentId="parent-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Ordner' }))
    const field = screen.getByLabelText('Name des Unterordners')
    await userEvent.type(field, 'Untergeordnet')
    fireEvent.focusOut(field)

    expect(createFolderAction).toHaveBeenCalledTimes(1)
    expect(createFolderAction).toHaveBeenCalledWith({
      name: 'Untergeordnet',
      parentId: 'parent-1',
    })
  })

  it('sends nothing for an empty name', async () => {
    renderWithIntl(<CreateFolder parentId={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Ordner' }))
    fireEvent.focusOut(screen.getByLabelText('Name des Ordners'))

    expect(createFolderAction).not.toHaveBeenCalled()
  })
})

describe('where a new folder goes', () => {
  /**
   * Reported from use: "+ Ordner" always made a subfolder of whatever was
   * selected, with no way to make one at the top level short of deselecting
   * first -- which loses the place you were looking at.
   */
  async function open(parentId: string | null, parentName: string | null = null) {
    search = new URLSearchParams(parentId ? `folder=${parentId}` : '')
    renderWithIntl(<CreateFolder parentId={parentId} parentName={parentName} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ordner' }))
  }

  it('offers the top level as well while a folder is selected', async () => {
    createFolderAction.mockResolvedValue({ ok: true, data: { id: 'f-9' } })
    await open('f-1', 'Kunden')

    // "top" rather than an empty value: empty would be indistinguishable from
    // "nothing chosen yet", which is what makes the field follow the library.
    await userEvent.selectOptions(screen.getByLabelText('Anlegen in'), 'top')
    await userEvent.type(screen.getByLabelText('Name des Ordners'), 'Partner{Enter}')

    expect(createFolderAction).toHaveBeenCalledWith({ name: 'Partner', parentId: null })
  })

  it('keeps the selected folder as the suggestion', async () => {
    createFolderAction.mockResolvedValue({ ok: true, data: { id: 'f-9' } })
    await open('f-1', 'Kunden')

    // Inside a folder, so the field says subfolder -- the label follows the
    // chosen destination rather than the button that opened the form.
    await userEvent.type(screen.getByLabelText('Name des Unterordners'), 'Innen{Enter}')

    expect(createFolderAction).toHaveBeenCalledWith({ name: 'Innen', parentId: 'f-1' })
  })

  it('asks nothing when there is nothing to choose between', async () => {
    await open(null)
    expect(screen.queryByLabelText('Anlegen in')).not.toBeInTheDocument()
  })
})
