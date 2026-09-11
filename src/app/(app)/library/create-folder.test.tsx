import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const createFolderAction = vi.fn()
vi.mock('@/server/actions/workshop', () => ({
  createFolderAction: (...args: unknown[]) => createFolderAction(...args),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

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

    render(<CreateFolder parentId={null} />)
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
    render(<CreateFolder parentId="parent-1" />)

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
    render(<CreateFolder parentId={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Ordner' }))
    fireEvent.focusOut(screen.getByLabelText('Name des Ordners'))

    expect(createFolderAction).not.toHaveBeenCalled()
  })
})
