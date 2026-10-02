import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

vi.mock('@/server/actions/workshop', () => ({
  restoreWorkshopAction: vi.fn(),
  purgeWorkshopAction: vi.fn(),
}))

const { TrashList } = await import('./trash-list')

/**
 * The bin lists what an editor works on as well, but only the owner and an
 * admin may restore or purge. The buttons used to be on every row, and an
 * editor's click ended in a permission error.
 */
describe('the bin', () => {
  it('offers restore and purge only where this person may use them', () => {
    renderWithIntl(
      <TrashList
        initial={[
          { id: 'w-own', title: 'Eigener', deletedAt: null, canDelete: true },
          { id: 'w-ed', title: 'Mitbearbeitet', deletedAt: null, canDelete: false },
        ]}
      />,
    )

    const [own, edited] = screen.getAllByRole('listitem')
    expect(within(own!).getByRole('button', { name: 'Wiederherstellen' })).toBeInTheDocument()
    expect(within(own!).getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument()

    expect(within(edited!).queryByRole('button')).not.toBeInTheDocument()
    expect(edited).toHaveTextContent(
      'Wiederherstellen kann nur, wem der Workshop gehört, oder ein Admin.',
    )
  })
})
