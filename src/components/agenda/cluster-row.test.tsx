import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduleEntry } from '@/domain/schedule/types'
import type { ClusterDto } from '@/domain/agenda/types'
import { ClusterRow, type ClusterEditing } from './cluster-row'

/**
 * A section can be named, coloured and taken out again.
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
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
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
        editing={{
          onPinChange: vi.fn(),
          onTitleChange: vi.fn(),
          onColorChange: vi.fn(),
          onRemove,
        }}
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
        editing={{
          onPinChange: vi.fn(),
          onTitleChange: vi.fn(),
          onColorChange: vi.fn(),
          onRemove: vi.fn(),
        }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Abschnitt „Ankommen“ löschen' })).toBeInTheDocument()
  })
})

describe('naming and colouring a section', () => {
  const editable = (over: Partial<ClusterEditing> = {}) => {
    const editing: ClusterEditing = {
      onPinChange: vi.fn(),
      onTitleChange: vi.fn(),
      onColorChange: vi.fn(),
      ...over,
    }
    render(<ClusterRow cluster={cluster} entry={entry} childCount={3} editing={editing} />)
    return editing
  }

  it('lets a section be renamed where it stands', async () => {
    const onTitleChange = vi.fn()
    editable({ onTitleChange })

    const field = screen.getByRole('textbox', { name: 'Name des Abschnitts' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Nachmittag')
    await userEvent.tab()

    expect(onTitleChange).toHaveBeenCalledWith('Nachmittag')
  })

  it('keeps the section named by its heading while the heading holds a field', async () => {
    // The e2e suite finds a section by its accessible name. That name is
    // computed from the heading, and a heading that holds an input still
    // resolves -- but only as long as the input stays inside it.
    editable()
    const field = screen.getByRole('textbox', { name: 'Name des Abschnitts' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Nachmittag')

    expect(screen.getByRole('group', { name: 'Nachmittag' })).toBeInTheDocument()
  })

  it('offers the palette by name, not by colour alone', async () => {
    const onColorChange = vi.fn()
    editable({ onColorChange })

    const picker = screen.getByRole('combobox', { name: 'Farbe des Abschnitts' })
    await userEvent.selectOptions(picker, screen.getByRole('option', { name: 'Bernstein' }))

    expect(onColorChange).toHaveBeenCalledWith('amber')
  })

  it('can take the colour off again', async () => {
    const onColorChange = vi.fn()
    editable({ onColorChange })

    const picker = screen.getByRole('combobox', { name: 'Farbe des Abschnitts' })
    await userEvent.selectOptions(picker, screen.getByRole('option', { name: 'Ohne Farbe' }))

    expect(onColorChange).toHaveBeenCalledWith(null)
  })

  it('puts the cursor in the name of a section that was just added', () => {
    render(
      <ClusterRow
        cluster={cluster}
        entry={entry}
        childCount={0}
        editing={{
          onPinChange: vi.fn(),
          onTitleChange: vi.fn(),
          onColorChange: vi.fn(),
          autoFocusTitle: true,
        }}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Name des Abschnitts' })
    expect(field).toHaveFocus()
    // Selected, so typing replaces the placeholder name rather than appending.
    expect((field as HTMLInputElement).selectionStart).toBe(0)
    expect((field as HTMLInputElement).selectionEnd).toBe(cluster.title.length)
  })
})
