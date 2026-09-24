import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduleEntry } from '@/domain/schedule/types'
import type { ClusterDto } from '@/domain/agenda/types'
import { ClusterRow } from './agenda-rows'

/**
 * A section can be taken out again.
 *
 * It could not, for as long as clusters only ever arrived over MCP: the row
 * offered a pin and nothing else, and nobody noticed because nobody in the web
 * app could make one either. Adopting a catalogue entry brings a section every
 * time, and a method somebody adopted and did not want left a header they
 * could not remove.
 */

const cluster: ClusterDto = {
  id: 'c1',
  title: 'Ankommen',
  color: 'slate',
  pinnedStartMinute: null,
  collapsed: false,
  targetDurationMinutes: null,
  order: 1,
}

const entry: ScheduleEntry = {
  startMinute: 540,
  endMinute: 585,
  durationMinutes: 45,
  pinned: false,
  conflict: null,
}

describe('ClusterRow', () => {
  it('offers no delete when the row is not editable', () => {
    // The read-only surfaces -- a shared link, the print view -- render the
    // same component without `editing`.
    render(<ClusterRow cluster={cluster} entry={entry} childCount={3} />)
    expect(screen.queryByRole('button', { name: /löschen/i })).not.toBeInTheDocument()
  })

  it('says how many blocks go with the section, rather than just "delete"', async () => {
    // The editor has no undo. A delete that quietly takes three blocks with it
    // is a surprise somebody cannot walk back.
    const onRemove = vi.fn()
    render(
      <ClusterRow
        cluster={cluster}
        entry={entry}
        childCount={3}
        editing={{ onPinChange: vi.fn(), onRemove }}
      />,
    )

    const button = screen.getByRole('button', { name: /Ankommen.*3 Blöcke/i })
    await userEvent.click(button)
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('does not promise blocks it would not take, for an empty section', () => {
    render(
      <ClusterRow
        cluster={cluster}
        entry={entry}
        childCount={0}
        editing={{ onPinChange: vi.fn(), onRemove: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Abschnitt „Ankommen“ löschen' })).toBeInTheDocument()
  })
})
