import { screen, within } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import { describe, expect, it } from 'vitest'
import { OAuthGuide } from './oauth-guide'

/**
 * The OAuth half of the token page. What is worth asserting is what would make
 * the instructions quietly wrong: a command that still carries a header (the
 * client would never start the OAuth flow), the address of some other host, and
 * the three facts the flow itself never tells anybody.
 */

const ORIGIN = 'https://gw.example'

function open(name: string) {
  const details = screen.getByText(name).closest('details')
  if (!details) throw new Error(`no disclosure around ${name}`)
  details.open = true
  return within(details)
}

describe('the OAuth instructions', () => {
  it('is a region named after its heading, apart from the token instructions', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    expect(screen.getByRole('region', { name: 'Ohne Token verbinden (OAuth)' })).toBeInTheDocument()
  })

  it('hands out this installation’s MCP address', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    expect(screen.getAllByText(`${ORIGIN}/api/mcp`).length).toBeGreaterThan(0)
  })

  /**
   * A header would make the client authenticate with it and never read the
   * 401 that starts the flow -- the token variant of this command is further up
   * the page, and mixing the two is the mistake worth guarding.
   */
  it('adds Claude Code without a header, so the client signs itself in', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    const command = open('Claude Code (OAuth)').getByText(/^claude mcp add /)
    expect(command).toHaveTextContent(
      `claude mcp add --transport http goodworkshop ${ORIGIN}/api/mcp`,
    )
    expect(command.textContent).not.toMatch(/--header|Authorization|gwp_/)
  })

  it('adds the Gemini CLI the same way', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    const command = open('Gemini CLI (OAuth)').getByText(/^gemini mcp add /)
    expect(command).toHaveTextContent(
      `gemini mcp add --transport http goodworkshop ${ORIGIN}/api/mcp`,
    )
    expect(command.textContent).not.toMatch(/--header|Authorization|gwp_/)
  })

  it('says the hosted clients need an address they can reach from the internet', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    expect(screen.getByText(/aus dem Internet per HTTPS erreichbar/)).toBeInTheDocument()
  })

  it('says to sign in first, because signing in on the way does not come back', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    expect(screen.getByText(/Melde dich vorher in diesem Browser/)).toBeInTheDocument()
  })

  it('says what a client connected this way may do, and where writing comes from', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    expect(screen.getByText(/nur lesen/)).toHaveTextContent('Workshops schreiben')
  })

  it('walks through Claude and ChatGPT, neither of which takes a token', () => {
    render(<OAuthGuide origin={ORIGIN} />)
    expect(open('Claude (Web, Desktop, App)').getByText(/Add custom connector/)).toBeInTheDocument()
    expect(open('ChatGPT').getByText(/Authentifizierung „OAuth“/)).toBeInTheDocument()
  })
})
