import { screen } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import { describe, expect, it } from 'vitest'
import type { Peer } from '@/features/agenda/document'
import { PeerMarks, PresenceBar } from './presence'

const peer = (over: Partial<Peer> = {}): Peer => ({
  clientId: 1,
  name: 'Anna Berger',
  hue: 250,
  kind: 'person',
  focusedBlockId: null,
  ...over,
})

describe('PresenceBar', () => {
  it('says nothing when nobody else is here', () => {
    const { container } = render(<PresenceBar peers={[]} />)
    // A permanent "1 person" chip is chrome people stop seeing, which is how
    // they also stop seeing it change.
    expect(container).toBeEmptyDOMElement()
  })

  it('names the people rather than colouring them', () => {
    render(<PresenceBar peers={[peer(), peer({ clientId: 2, name: 'Ruben Ott', hue: 40 })]} />)
    expect(screen.getByText('Anna Berger')).toBeInTheDocument()
    expect(screen.getByText('Ruben Ott')).toBeInTheDocument()
  })

  it('marks a model as a model', () => {
    // The point of the label: an LLM writing through MCP joins this room like a
    // person, and must not be able to pass for a colleague.
    render(<PresenceBar peers={[peer({ kind: 'model', name: 'KI-Assistent' })]} />)
    expect(screen.getByText('KI-Assistent')).toBeInTheDocument()
  })
})

describe('PeerMarks', () => {
  it('draws nothing on a row nobody is in', () => {
    const { container } = render(<PeerMarks peers={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says who is in the row, in words', () => {
    render(<PeerMarks peers={[peer()]} />)
    expect(screen.getByText(/Anna Berger/)).toBeInTheDocument()
    expect(screen.getByText(/bearbeitet diesen Block gerade/)).toBeInTheDocument()
  })

  it('counts the rest instead of stacking every name', () => {
    render(
      <PeerMarks
        peers={[
          peer(),
          peer({ clientId: 2, name: 'Ruben Ott' }),
          peer({ clientId: 3, name: 'Tom' }),
        ]}
      />,
    )
    expect(screen.getByText(/Anna Berger \+2/)).toBeInTheDocument()
  })

  it('labels a model here too', () => {
    render(<PeerMarks peers={[peer({ kind: 'model', name: 'KI-Assistent' })]} />)
    expect(screen.getByText(/KI-Assistent/)).toBeInTheDocument()
  })
})

/**
 * The room names participants on the SERVER, where there is no request
 * language -- the collaboration bundle has no next-intl in it on purpose. So
 * the name arrives in German whatever the reader speaks, and for a model the
 * client has to say it itself.
 *
 * Asserted in English because that is where the bug was visible: an English
 * screen telling its reader that "KI-Assistent (KI)" is in their document.
 */
describe('a participant that is not a person', () => {
  const model = {
    clientId: 1,
    name: 'KI-Assistent',
    hue: 292,
    kind: 'model' as const,
    focusedBlockId: null,
  }

  it('is named in the reader’s language, not the one the server sent', () => {
    render(<PresenceBar peers={[model]} />, { locale: 'en' })
    expect(screen.getByText('AI assistant')).toBeInTheDocument()
    expect(screen.queryByText(/KI-Assistent/)).toBeNull()
    expect(screen.queryByText(/\(KI\)/)).toBeNull()
  })

  it('is named the same way on the row it is editing', () => {
    render(<PeerMarks peers={[model]} />, { locale: 'en' })
    expect(screen.getByText('AI assistant')).toBeInTheDocument()
    expect(screen.queryByText(/KI-Assistent/)).toBeNull()
  })

  it('tells a screen reader what is happening, also in their language', () => {
    render(<PeerMarks peers={[model]} />, { locale: 'en' })
    expect(screen.getByText('is editing this block')).toBeInTheDocument()
  })

  it('still shows a person under the name they gave', () => {
    const person = { ...model, kind: 'person' as const, name: 'Linh' }
    render(<PresenceBar peers={[person]} />, { locale: 'en' })
    expect(screen.getByText('Linh')).toBeInTheDocument()
  })
})
