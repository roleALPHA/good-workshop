import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import de from '@/messages/de.json'

const createWorkshopAction = vi.fn()
const push = vi.fn()
let search = new URLSearchParams()

vi.mock('@/server/actions/workshop', () => ({
  createWorkshopAction: (...args: unknown[]) => createWorkshopAction(...args),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => search,
}))

const { CreateWorkshop } = await import('./create-workshop')

/**
 * Where a new workshop is filed.
 *
 * Reported from use: two of ten new workshops did not land in the folder that
 * was selected. The folder reaches this component as a prop, and a prop is one
 * render behind the URL -- selecting a folder and typing a title right away
 * files the workshop where the library stood a moment ago.
 */

function show(folderId: string | null, folderName: string | null = null) {
  render(
    <NextIntlClientProvider locale="de" messages={de}>
      <CreateWorkshop folderId={folderId} folderName={folderName} />
    </NextIntlClientProvider>,
  )
}

async function name(title: string) {
  await userEvent.click(screen.getByRole('button', { name: /Workshop/ }))
  await userEvent.type(screen.getByLabelText('Titel des Workshops'), `${title}{Enter}`)
}

describe('creating a workshop', () => {
  beforeEach(() => {
    createWorkshopAction.mockReset()
    createWorkshopAction.mockResolvedValue({ ok: true, data: { workshopId: 'w-1' } })
    push.mockReset()
    search = new URLSearchParams()
  })

  it('files it in the folder the library is showing', async () => {
    search = new URLSearchParams('folder=f-1')
    show('f-1', 'Kunden')
    await name('Kickoff')

    expect(createWorkshopAction).toHaveBeenCalledWith({ title: 'Kickoff', folderId: 'f-1' })
  })

  it('follows the address bar when the prop is still the previous folder', async () => {
    // The state a click on another folder leaves behind while the page is being
    // fetched: the URL already names the new folder, the rendered prop does not.
    search = new URLSearchParams('folder=f-2')
    show('f-1', 'Kunden')
    await name('Kickoff')

    expect(createWorkshopAction).toHaveBeenCalledWith({ title: 'Kickoff', folderId: 'f-2' })
  })

  it('files it nowhere when the library shows everything', async () => {
    show(null)
    await name('Kickoff')

    expect(createWorkshopAction).toHaveBeenCalledWith({ title: 'Kickoff', folderId: null })
  })

  it('says where it will be filed, so a wrong folder is visible beforehand', async () => {
    show('f-1', 'Kunden')
    await userEvent.click(screen.getByRole('button', { name: /Workshop/ }))

    expect(screen.getByText(/Kunden/)).toBeInTheDocument()
  })
})
