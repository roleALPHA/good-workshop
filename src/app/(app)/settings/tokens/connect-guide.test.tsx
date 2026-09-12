import { screen, within } from '@testing-library/react'
import { renderWithIntl as render } from '@/test/intl'
import { describe, expect, it } from 'vitest'
import { ConnectGuide } from './connect-guide'

/**
 * The instructions are only worth anything if they are finished: the host this
 * installation actually runs on, and the token that was just made. A snippet
 * somebody still has to edit is the sentence the screen already had.
 */

const ORIGIN = 'https://gw.example'
const TOKEN = 'gwp_abcdefghijkl_secret'

function open(name: string) {
  const summary = screen.getByText(name)
  const details = summary.closest('details')
  if (!details) throw new Error(`no disclosure around ${name}`)
  details.open = true
  return within(details)
}

describe('the connection instructions', () => {
  it('fills the Claude Code command with this host and this token', () => {
    render(<ConnectGuide origin={ORIGIN} token={TOKEN} />)
    expect(open('Claude Code').getByText(/^claude mcp add /)).toHaveTextContent(
      `claude mcp add --transport http goodworkshop ${ORIGIN}/api/mcp --header "Authorization: Bearer ${TOKEN}"`,
    )
  })

  it('fills the Gemini CLI command the same way', () => {
    render(<ConnectGuide origin={ORIGIN} token={TOKEN} />)
    expect(open('Gemini CLI').getByText(/^gemini mcp add /)).toHaveTextContent(
      `gemini mcp add --transport http --header "Authorization: Bearer ${TOKEN}" goodworkshop ${ORIGIN}/api/mcp`,
    )
  })

  it('keeps the Claude Desktop header out of the argument list', () => {
    render(<ConnectGuide origin={ORIGIN} token={TOKEN} />)
    const config =
      open('Claude Desktop').getByText(/mcpServers/, { selector: 'code' }).textContent ?? ''

    // A space after the colon would make Claude Desktop split this into two
    // arguments and drop the header, with no error to show for it.
    expect(config).toContain('"Authorization:${GW_TOKEN}"')
    expect(config).toContain(`"GW_TOKEN": "Bearer ${TOKEN}"`)
    expect(JSON.parse(config).mcpServers.goodworkshop.args).toContain(`${ORIGIN}/api/mcp`)
  })

  it('hands Langdock the bare token, because it adds the Bearer itself', () => {
    render(<ConnectGuide origin={ORIGIN} token={TOKEN} />)
    const langdock = open('Langdock')
    expect(langdock.getByText(TOKEN)).toBeInTheDocument()
    expect(langdock.getByText(`${ORIGIN}/api/mcp`)).toBeInTheDocument()
    expect(langdock.queryByText(new RegExp(`Bearer ${TOKEN}`))).not.toBeInTheDocument()
  })

  it('shows a placeholder rather than a secret once there is none', () => {
    render(<ConnectGuide origin={ORIGIN} token={null} />)
    expect(open('Claude Code').getByText(/^claude mcp add /)).toHaveTextContent('gwp_dein_token')
    expect(screen.queryByText(new RegExp(TOKEN))).not.toBeInTheDocument()
  })
})
