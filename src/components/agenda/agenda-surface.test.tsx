import { screen, within } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import { describe, expect, it, vi } from 'vitest'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { AgendaSurface } from './agenda-surface'

/**
 * The whole agenda, rendered from the reference fixture.
 *
 * These assertions lived in an end-to-end suite that loaded /demo -- a public
 * page whose only remaining purpose was to give them a screen with a rich
 * agenda on it. Everything they actually check is derivation and wording:
 * computed start times, an overlap stated in words, a cluster duration summed
 * from its children. None of that needs a browser, and here it runs in
 * milliseconds against the same fixture the export snapshots read.
 *
 * What deliberately did NOT move here is anything about layout, colour tokens
 * or dragging: jsdom has no layout engine and resolves no OKLCH. Those
 * assertions stayed end-to-end, against a real workshop.
 */

/** The surface picks its layout from a media query jsdom does not implement. */
function renderAt(width: 'desktop' | 'phone') {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: width === 'desktop' && query.includes('min-width: 1024px'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
  return render(<AgendaSurface doc={createDemoDay()} />)
}

const block = (name: string) => screen.getByRole('article', { name })

describe('the agenda as a whole', () => {
  it('derives every start time from the one pinned block', () => {
    renderAt('phone')

    // 13:00 is pinned; everything after it follows from durations alone.
    expect(block('Check-in & Start')).toHaveTextContent('13:00')
    expect(block('Agenda & Spielregeln')).toHaveTextContent('13:15')
    expect(block('Energizer: Zwei Wahrheiten')).toHaveTextContent('13:25')
    expect(block('Druckpunkte')).toHaveTextContent('13:35')
  })

  it('keeps the blocks in agenda order', () => {
    renderAt('phone')

    // Asserted through document position rather than through a list of names:
    // the accessible name is computed from the contents, which the two layouts
    // hold in different places, so there is no one attribute to read.
    const order = [
      'Check-in & Start',
      'Agenda & Spielregeln',
      'Energizer: Zwei Wahrheiten',
      'Druckpunkte',
    ].map(block)

    for (const [index, earlier] of order.slice(0, -1).entries()) {
      const later = order[index + 1]!
      expect(
        earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${order[index + 1]} steht nach ${order[index]}`,
      ).toBeTruthy()
    }
  })

  it('announces a pinned start instead of signalling it with an icon alone', () => {
    renderAt('phone')

    expect(within(block('Check-in & Start')).getByText('Startzeit fixiert:')).toBeInTheDocument()
    expect(
      within(block('Agenda & Spielregeln')).queryByText('Startzeit fixiert:'),
    ).not.toBeInTheDocument()
  })

  it('states an overlap in words rather than silently shortening a block', () => {
    renderAt('phone')

    const lunch = block('Mittagessen')
    expect(lunch).toHaveTextContent('14:30')
    expect(lunch).toHaveTextContent('Überschneidet den vorherigen Block um 30m')

    // Nothing was auto-shortened: lunch runs its full hour and the block after
    // it starts accordingly.
    expect(block('IT-Management verorten')).toHaveTextContent('15:30')
  })

  it('derives a cluster duration from its children', () => {
    renderAt('phone')

    // 15 + 10 + 10 = 35, starting where its first, pinned child starts.
    const section = screen.getByRole('group', { name: 'Ankommen & Rahmen' })
    expect(section).toHaveTextContent('3 Blöcke · 35m')
    expect(section).toHaveTextContent('13:00')
  })

  it('shows the running end time and flags going over plan', () => {
    renderAt('phone')

    // The day is planned to 17:00 and the blocks add up past it.
    const end = screen.getByText('Ende', { exact: true }).parentElement
    expect(end).toHaveTextContent('17:30')
    expect(end).toHaveTextContent('30m über Plan')
  })

  it('labels the columns on a wide screen', () => {
    renderAt('desktop')
    expect(screen.getByText('Titel und Beschreibung')).toBeInTheDocument()
  })

  /**
   * Sozialform is declared by every block type and used to be reachable only
   * by expanding a row, which for the field a facilitator consults most often
   * amounted to hiding it. It now sits beside the times.
   */
  it('reads the participation format off the row, without opening anything', () => {
    renderAt('phone')
    expect(block('Check-in & Start')).toHaveTextContent('Plenum')
    expect(block('Spannungsfelder sammeln')).toHaveTextContent('Kleingruppen')
  })

  it('gives a reader the format as a word and no control to change it', () => {
    renderAt('phone')
    expect(
      within(block('Check-in & Start')).queryByRole('button', { name: /Sozialform/ }),
    ).not.toBeInTheDocument()
  })

  it('lets an editor set the format from the row itself', () => {
    renderAt('desktop')
    expect(
      within(block('Check-in & Start')).getByRole('button', { name: 'Sozialform: Plenum' }),
    ).toBeInTheDocument()
  })

  /**
   * The additional-info column used to carry its own list of field keys, which
   * is why two fields flagged for it in the schema never showed up. It now
   * asks the schema.
   */
  it('shows every field the schema flags for the table, not a list kept here', () => {
    renderAt('phone')
    // materials was the only one the old hardcoded list got right.
    expect(block('Druckpunkte')).toHaveTextContent('Klebepunkte')
    // deliverable and catering_note are flagged `summary` in the schema and
    // used to reach the column only because the list happened to name them.
    expect(block('Spannungsfelder sammeln')).toHaveTextContent('Ein Flipchart je Gruppe')
    expect(block('Mittagessen')).toHaveTextContent('Vegetarische Option ist bestellt.')
    // `method` is flagged too and never appeared at all before -- and it
    // arrives as its label, not as the `consent` the schema stores.
    expect(block('Einwandintegration')).toHaveTextContent('Konsent')
    expect(block('Einwandintegration')).not.toHaveTextContent('consent')
  })

  it('offers an editor the material of a row where the row is', () => {
    renderAt('desktop')
    expect(
      within(block('Agenda & Spielregeln')).getByLabelText('Material hinzufügen'),
    ).toBeInTheDocument()
  })

  it('offers an editor a lock for the start time of a block and of a section', () => {
    renderAt('desktop')

    expect(
      within(block('Agenda & Spielregeln')).getByRole('button', { name: 'Startzeit fixieren' }),
    ).toBeInTheDocument()
    // The section itself carries no pin in the fixture -- its start is derived
    // from the pinned block inside it -- so what it offers is the way to set one.
    expect(
      within(screen.getByRole('group', { name: 'Ankommen & Rahmen' })).getByRole('button', {
        name: 'Startzeit fixieren',
      }),
    ).toBeInTheDocument()
  })

  // Its counterpart -- that the phone layout HIDES those headers -- stayed
  // end-to-end. They are in the document either way and only CSS takes them off
  // screen, which jsdom neither applies nor can be asked about.
})
