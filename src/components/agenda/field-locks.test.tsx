import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl as render } from '@/test/intl'
import { lockKey } from '@/domain/collab/locks'
import type { AgendaDocument, Peer } from '@/features/agenda/document'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { useLocalDocument } from '@/features/agenda/use-local-document'
import { AgendaEditor } from './agenda-editor'

/**
 * One person per field.
 *
 * Asked for after "last write wins" turned out to be what people met in
 * practice: two facilitators in one block, one of them losing a paragraph.
 * A field somebody else is typing in is shown as theirs and cannot be
 * entered; the others in the same block stay open.
 */

const anna: Peer = {
  clientId: 9,
  name: 'Anna Berger',
  hue: 250,
  kind: 'person',
  focusedBlockId: 'm-1',
  editing: { blockId: 'm-1', field: 'desc.description', since: 1 },
}

function Editor({
  locks = new Map(),
  setFocus = () => {},
  idleMs,
  note,
}: {
  locks?: Map<string, Peer>
  setFocus?: AgendaDocument['setFocus']
  idleMs?: number
  note?: string
}) {
  const local = useLocalDocument({ ...createDemoDay(), desc: note ? { text: note } : {} })
  return (
    <AgendaEditor
      document={{ ...local, peers: [...new Set(locks.values())], locks, setFocus }}
      idleMs={idleMs}
    />
  )
}

const row = (title: string) => within(screen.getByRole('article', { name: title }))

describe('a field somebody else is typing in', () => {
  it('cannot be entered, and says whose it is', () => {
    render(<Editor locks={new Map([[lockKey('m-1', 'desc.description'), anna]])} />)
    const block = row('Check-in & Start')

    expect(block.getByRole('textbox', { name: 'Beschreibung' })).toBeDisabled()
    expect(block.getByText('Anna Berger schreibt gerade')).toBeInTheDocument()
  })

  it('leaves the other fields of the same block open', () => {
    render(<Editor locks={new Map([[lockKey('m-1', 'desc.description'), anna]])} />)
    const block = row('Check-in & Start')

    expect(block.getByRole('textbox', { name: 'Titel' })).toBeEnabled()
    expect(block.getByRole('textbox', { name: 'Dauer' })).toBeEnabled()
  })

  it('locks a field behind "Mehr Felder" by its own name', async () => {
    const user = userEvent.setup()
    const held = {
      ...anna,
      focusedBlockId: 'm-5',
      editing: { blockId: 'm-5', field: 'desc.task', since: 1 },
    }
    render(<Editor locks={new Map([[lockKey('m-5', 'desc.task'), held]])} />)

    const block = row('Spannungsfelder sammeln')
    await user.click(block.getByRole('button', { name: /Mehr Felder/ }))

    expect(block.getByLabelText('Arbeitsauftrag')).toBeDisabled()
    expect(block.getByLabelText('Gruppengröße')).toBeEnabled()
  })
})

describe('what else can be held', () => {
  it('locks the name of a section', () => {
    const held = {
      ...anna,
      focusedBlockId: 'cl-1',
      editing: { blockId: 'cl-1', field: 'title', since: 1 },
    }
    render(<Editor locks={new Map([[lockKey('cl-1', 'title'), held]])} />)

    const names = screen.getAllByRole('textbox', { name: 'Name des Abschnitts' })
    const section = names.find((el) => (el as HTMLInputElement).value === 'Ankommen & Rahmen')!
    expect(section).toBeDisabled()
    expect(
      names.filter((el) => el !== section).every((el) => !(el as HTMLInputElement).disabled),
    ).toBe(true)
  })

  it('locks the note on the day', () => {
    const held = {
      ...anna,
      focusedBlockId: null,
      editing: { blockId: 'day', field: 'note', since: 1 },
    }
    render(<Editor note="Raum 4.12" locks={new Map([[lockKey('day', 'note'), held]])} />)

    expect(screen.getByRole('textbox', { name: 'Notiz zum Tag' })).toBeDisabled()
  })
})

describe('entering a field', () => {
  it('claims that field, and leaving the agenda gives it back', async () => {
    const user = userEvent.setup()
    const setFocus = vi.fn()
    render(<Editor setFocus={setFocus} />)
    const block = row('Check-in & Start')

    await user.click(block.getByRole('textbox', { name: 'Beschreibung' }))
    expect(setFocus).toHaveBeenLastCalledWith('m-1', 'desc.description')

    await user.click(block.getByRole('textbox', { name: 'Titel' }))
    expect(setFocus).toHaveBeenLastCalledWith('m-1', 'title')

    await user.click(document.body)
    expect(setFocus).toHaveBeenLastCalledWith(null, null)
  })
})

/**
 * Thirty seconds in production. A cursor left standing in a field over lunch
 * would otherwise hold it for as long as the tab stays open.
 */
describe('a field left alone', () => {
  it('is saved and given back once nothing has been typed for the idle time', async () => {
    const user = userEvent.setup()
    const setFocus = vi.fn()
    render(<Editor setFocus={setFocus} idleMs={80} />)
    const field = row('Check-in & Start').getByRole('textbox', { name: 'Beschreibung' })

    await user.click(field)
    await user.clear(field)
    await user.type(field, 'Nach der Pause')

    await waitFor(() => expect(field).not.toHaveFocus(), { timeout: 1000 })
    expect(setFocus).toHaveBeenLastCalledWith(null, null)
    // Saved on the way out, not thrown away: blur is what commits.
    expect(row('Check-in & Start').getByRole('textbox', { name: 'Beschreibung' })).toHaveValue(
      'Nach der Pause',
    )
  })

  it('is kept while somebody keeps typing', async () => {
    const user = userEvent.setup()
    render(<Editor idleMs={150} />)
    const field = row('Check-in & Start').getByRole('textbox', { name: 'Beschreibung' })

    await user.click(field)
    for (let i = 0; i < 4; i += 1) {
      await user.type(field, 'x')
      await act(() => new Promise((resolve) => setTimeout(resolve, 80)))
    }
    expect(field).toHaveFocus()
  })
})
