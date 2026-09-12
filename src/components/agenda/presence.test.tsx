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
    expect(screen.getByText('KI-Assistent (KI)')).toBeInTheDocument()
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
    expect(screen.getByText(/KI-Assistent \(KI\)/)).toBeInTheDocument()
  })
})
