import { render, screen, within } from '@testing-library/react'
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

  // Its counterpart -- that the phone layout HIDES those headers -- stayed
  // end-to-end. They are in the document either way and only CSS takes them off
  // screen, which jsdom neither applies nor can be asked about.
})
