import { screen, within } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import { describe, expect, it } from 'vitest'
import { OPERATOR_OAUTH_SCOPES } from '@/server/operator/scopes'
import { OAuthGuide } from './oauth-guide'

/**
 * The console's connection instructions.
 *
 * Worth asserting is what would make them quietly wrong rather than visibly
 * broken: a command that carries a header (the client would authenticate with
 * it and never read the 401 that starts the flow), an address that is not the
 * one discovery advertises, a permission list that has drifted from the
 * server's, and the three facts the flow itself never tells anybody -- the
 * tailnet, the second passkey prompt, and `ops:danger`.
 */

const ENDPOINT = 'https://ops.example/operator/api/mcp'

function open(name: string) {
  const details = screen.getByText(name).closest('details')
  if (!details) throw new Error(`no disclosure around ${name}`)
  details.open = true
  return within(details)
}

describe("the console's OAuth instructions", () => {
  it('is a region named after its heading', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    expect(screen.getByRole('region', { name: 'Connect a client over OAuth' })).toBeInTheDocument()
  })

  /**
   * Passed in rather than assembled, so that this and the protected-resource
   * document cannot disagree. A guide naming a second address is a guide that
   * sends somebody to a 404 with no way to tell which of the two is wrong.
   */
  it('hands out the endpoint it was given, and invents none of it', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    expect(screen.getAllByText(ENDPOINT).length).toBeGreaterThan(0)
    expect(screen.queryByText(/ops\.goodworkshop\.org/)).not.toBeInTheDocument()
  })

  it('adds Claude Code without a header, so the client signs itself in', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    const command = open('Claude Code').getByText(/^claude mcp add /)
    expect(command).toHaveTextContent(
      `claude mcp add --transport http goodworkshop-ops ${ENDPOINT}`,
    )
    expect(command.textContent).not.toMatch(/--header|Authorization|gwop/)
  })

  it('adds the Gemini CLI the same way', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    const command = open('Gemini CLI').getByText(/^gemini mcp add /)
    expect(command).toHaveTextContent(
      `gemini mcp add --transport http goodworkshop-ops ${ENDPOINT}`,
    )
    expect(command.textContent).not.toMatch(/--header|Authorization|gwop/)
  })

  /**
   * The name matters on its own: whoever operates the cloud has the customers'
   * server connected as `goodworkshop` already, and a second `mcp add` under
   * that name replaces it without saying so.
   */
  it('names the server so it cannot displace the customers’ one', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    expect(open('Claude Code').getByText(/goodworkshop-ops/)).toBeInTheDocument()
  })

  it('says a hosted connector cannot reach this console at all', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    expect(screen.getByText(/answers the tailnet only/)).toBeInTheDocument()
    expect(screen.getByText(/refused with 403/)).toBeInTheDocument()
  })

  it('warns that the approval screen asks for the passkey again', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    expect(screen.getByText(/Expect the passkey once more/)).toBeInTheDocument()
    expect(screen.getByText(/you have not been signed out/)).toBeInTheDocument()
  })

  /**
   * Read off the server's own list rather than written out here: a scope added
   * to OPERATOR_OAUTH_SCOPES that never reaches this page is a permission
   * somebody grants without having been told it exists.
   */
  it('names every permission a client may be granted, and no more', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    const note = screen.getByText(new RegExp(OPERATOR_OAUTH_SCOPES.join(', ')))
    expect(note).toBeInTheDocument()
  })

  it('says ops:danger is not among them and is never granted by asking for everything', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    expect(screen.getByText('ops:danger')).toBeInTheDocument()
    expect(OPERATOR_OAUTH_SCOPES).not.toContain('ops:danger')
    expect(screen.getByText(/not granted by asking for everything/)).toBeInTheDocument()
  })

  it('points at the list above for taking a connection away again', () => {
    render(<OAuthGuide endpoint={ENDPOINT} />)
    expect(screen.getByText(/Connected clients above/)).toBeInTheDocument()
  })
})
