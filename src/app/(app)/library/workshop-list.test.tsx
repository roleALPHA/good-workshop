import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkshopSummary } from '@/domain/workshop/repo'
import { renderWithIntl } from '@/test/intl'

const moveWorkshopAction = vi.fn()
const trashWorkshopAction = vi.fn()
const loadLibrary = vi.fn()

vi.mock('@/server/actions/workshop', () => ({
  moveWorkshopAction: (...args: unknown[]) => moveWorkshopAction(...args),
  moveFolderAction: vi.fn(),
  trashWorkshopAction: (...args: unknown[]) => trashWorkshopAction(...args),
  loadLibrary: (...args: unknown[]) => loadLibrary(...args),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const { WorkshopList } = await import('./workshop-list')
const { LibraryDnd } = await import('./library-dnd')

/**
 * Filing a workshop away from the list it is in.
 *
 * The select is not the fallback for the drag -- it is the mechanism. It is the
 * only one that works on a phone, with a keyboard and with a screen reader, so
 * these tests describe the feature and the drag is an accelerator on top.
 */

const FOLDERS = [
  { id: 'f-kunden', name: 'Kunden', depth: 0 },
  { id: 'f-archiv', name: 'Archiv', depth: 1 },
]

function workshop(overrides: Partial<WorkshopSummary> = {}): WorkshopSummary {
  return {
    id: 'w-1',
    title: 'Strategie-Retreat',
    status: 'draft',
    folderId: null,
    updatedAt: new Date('2026-04-15T10:00:00Z'),
    dayCount: 2,
    tags: [],
    role: 'owner',
    ...overrides,
  }
}

function show(
  workshops: WorkshopSummary[],
  query: { folderId?: string | null } = {},
  cursor: string | null = null,
) {
  return renderWithIntl(
    <WorkshopList
      initial={workshops}
      initialCursor={cursor}
      query={query}
      filtered={query.folderId !== undefined}
      folders={FOLDERS}
    />,
  )
}

/** The row is reached through its link: the <li> itself has no name of its own. */
const rowFor = (title: string): HTMLElement => {
  const row = screen.getByRole('link', { name: new RegExp(title) }).closest('li')
  if (!row) throw new Error(`no row for ${title}`)
  return row
}

async function openMoveControl(title: string) {
  await userEvent.click(
    within(rowFor(title)).getByRole('button', { name: `${title} in einen Ordner verschieben` }),
  )
  return within(rowFor(title)).getByLabelText('Verschieben nach')
}

afterEach(() => {
  moveWorkshopAction.mockReset()
  trashWorkshopAction.mockReset()
  loadLibrary.mockReset()
})

describe('filing a workshop from the list', () => {
  it('sends the chosen folder', async () => {
    moveWorkshopAction.mockResolvedValue({ ok: true, data: null })
    show([workshop()])

    await userEvent.selectOptions(await openMoveControl('Strategie-Retreat'), 'f-kunden')

    expect(moveWorkshopAction).toHaveBeenCalledWith({
      workshopId: 'w-1',
      folderId: 'f-kunden',
    })
  })

  it('reads the empty option as the top level rather than as nothing chosen', async () => {
    moveWorkshopAction.mockResolvedValue({ ok: true, data: null })
    show([workshop({ folderId: 'f-kunden' })])

    await userEvent.selectOptions(await openMoveControl('Strategie-Retreat'), '')

    expect(moveWorkshopAction).toHaveBeenCalledWith({ workshopId: 'w-1', folderId: null })
  })

  /**
   * The list keeps its rows in state, so a server revalidation does not reach
   * it. Left alone, a workshop filed out of the folder you are looking at would
   * sit there until the next navigation -- visibly still in a folder it has
   * left.
   */
  it('takes the row out of a list that is filtered to the folder it left', async () => {
    moveWorkshopAction.mockResolvedValue({ ok: true, data: null })
    show([workshop({ folderId: 'f-kunden' })], { folderId: 'f-kunden' })

    await userEvent.selectOptions(await openMoveControl('Strategie-Retreat'), 'f-archiv')

    expect(screen.queryByText('Strategie-Retreat')).not.toBeInTheDocument()
  })

  it('keeps the row in the unfiltered list and says where it went', async () => {
    moveWorkshopAction.mockResolvedValue({ ok: true, data: null })
    show([workshop()])

    expect(within(rowFor('Strategie-Retreat')).getByText('Ohne Ordner')).toBeInTheDocument()

    await userEvent.selectOptions(await openMoveControl('Strategie-Retreat'), 'f-kunden')

    expect(within(rowFor('Strategie-Retreat')).getByText('Kunden')).toBeInTheDocument()
  })

  it('puts the row back and says why when the move fails', async () => {
    moveWorkshopAction.mockResolvedValue({ ok: false, message: 'Den Zielordner gibt es nicht.' })
    show([workshop({ folderId: 'f-kunden' })], { folderId: 'f-kunden' })

    await userEvent.selectOptions(await openMoveControl('Strategie-Retreat'), 'f-archiv')

    expect(screen.getByText('Strategie-Retreat')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Den Zielordner gibt es nicht.')
  })

  /**
   * The server refuses it anyway -- a viewer has no workshop.update -- but a
   * control that always fails is worse than no control.
   */
  it('offers nothing to somebody who may only read', async () => {
    show([workshop({ role: 'viewer' })])

    expect(
      screen.queryByRole('button', { name: 'Strategie-Retreat in einen Ordner verschieben' }),
    ).not.toBeInTheDocument()
  })
})

describe('loading the next page', () => {
  /**
   * `folderId: null` means "only workshops without a folder" on the server, so
   * conflating it with "no folder filter" made page two of the whole library
   * show nothing but the loose workshops.
   */
  it('does not turn an unfiltered library into the top level', async () => {
    loadLibrary.mockResolvedValue({ ok: true, data: { workshops: [], nextCursor: null } })
    show([workshop()], {}, 'cursor-1')

    await userEvent.click(screen.getByRole('button', { name: 'Mehr laden' }))

    expect(loadLibrary).toHaveBeenCalledWith({ cursor: 'cursor-1' })
  })
})

describe('the move button when dragging is on', () => {
  /**
   * The button that opens the list is also the drag source, and that only works
   * because neither sensor activates on a plain press: the mouse needs 6px of
   * travel, touch a 200ms hold. If that ever stopped holding, every click on
   * this button would be swallowed and the keyboard path -- the only one a
   * screen reader has -- would be gone with it.
   */
  it('still opens the list on a plain click', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('min-width: 768px'),
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    )

    renderWithIntl(
      <LibraryDnd folders={[]}>
        <WorkshopList
          initial={[workshop()]}
          initialCursor={null}
          query={{}}
          filtered={false}
          folders={FOLDERS}
        />
      </LibraryDnd>,
    )

    const button = screen.getByRole('button', {
      name: 'Strategie-Retreat in einen Ordner verschieben',
    })
    expect(button).toHaveAttribute('aria-roledescription')

    await userEvent.click(button)

    expect(within(rowFor('Strategie-Retreat')).getByLabelText('Verschieben nach')).toBeVisible()
    vi.unstubAllGlobals()
  })
})
