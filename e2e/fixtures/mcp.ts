import { execFileSync } from 'node:child_process'
import { expect, type APIRequestContext } from '@playwright/test'

/**
 * Calling /api/mcp from a test.
 *
 * One place, because two of the three things below are easy to leave out and
 * neither failure looks like what it is.
 */

const tokens = new Map<string, string>()

/**
 * One token per person for the whole run. Creating it shells out, so it is
 * worth keeping.
 *
 * Without an address it is the signed-in admin's. A member's own token is how
 * an access test asks the server what that member may do -- an admin's token
 * would answer "everything" and prove nothing.
 */
export function tokenForMcp(email = process.env.E2E_EMAIL ?? 'e2e@example.test'): string {
  const known = tokens.get(email)
  if (known) return known
  const token = /gwp_[A-Za-z0-9_-]+/.exec(
    execFileSync(
      'node',
      [
        'scripts/cli.mjs',
        'token',
        'create',
        '--email',
        email,
        '--name',
        'e2e',
        '--scopes',
        'workshops:read,workshops:write',
      ],
      { encoding: 'utf8' },
    ),
  )?.[0]
  if (!token) throw new Error(`Kein MCP-Token aus der CLI für ${email}`)
  tokens.set(email, token)
  return token
}

/**
 * A client address of this caller's own, in a header the app already reads.
 *
 * /api/mcp allows 60 calls a minute per address, and with no proxy in the
 * harness `clientAddress` falls back to one shared bucket for the whole suite --
 * the "blunt" case its own comment names. Every seeded day spends three calls
 * out of it, so the suite ends up rate-limiting itself, and the limit is the one
 * thing here that must not be softened: it is what keeps a stranger from driving
 * a database write per request.
 *
 * The symptom is a test that fails only once a new one is added, and never on
 * its own: `429 rate_limited` while seeding, or a response body that is simply
 * empty where a tool result was expected. Which is what it did -- twice, months
 * apart, and both times the suite looked broken rather than throttled.
 *
 * Not a dodge. Each caller here stands for a different client; the header is how
 * a real deployment says so, and the harness has no proxy to say it.
 */
let issued = 0
export const mcpAddress = () => {
  const worker = Number(process.env.TEST_PARALLEL_INDEX ?? 0)
  issued += 1
  return `10.${worker}.${Math.floor(issued / 256) % 256}.${issued % 256}`
}

/** What the SSE transport carried back: the raw body and the parsed result. */
export type McpAnswer = { body: string; structured: Record<string, unknown> }

async function callOnce(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>,
  address: string,
  token: string,
): Promise<McpAnswer & { isError: boolean }> {
  const response = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'x-forwarded-for': address,
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const body = await response.text()
  expect(response.ok(), `${name}: HTTP ${response.status()} ${body}`).toBeTruthy()

  // The transport is server-sent events, so the JSON sits behind a `data:` line.
  const payload = /^data: (.+)$/m.exec(body)
  if (!payload) return { body: '', structured: {}, isError: false }

  // Read the ids from structuredContent rather than from the human-readable
  // text: they are in both, but the prose carries them across an escaped
  // newline, and a regex over that is a trap somebody falls into twice.
  const message = JSON.parse(payload[1]!) as {
    result?: {
      content?: { text?: string }[]
      structuredContent?: Record<string, unknown>
      isError?: boolean
    }
  }
  return {
    body: message.result?.content?.[0]?.text ?? '',
    structured: message.result?.structuredContent ?? {},
    isError: message.result?.isError === true,
  }
}

/**
 * Calls a tool and hands back what it said.
 *
 * Retried once on an empty body, and that is not a flake being papered over: the
 * stream can close before the single `data:` line arrives, and the tools are
 * idempotent enough for a second attempt to be the right answer rather than a
 * second write. A caller asserting on `body` therefore never has to spell that
 * out again.
 */
export async function callMcpTool(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>,
  address = mcpAddress(),
  token = tokenForMcp(),
): Promise<McpAnswer> {
  let answer = await callOnce(request, name, args, address, token)
  if (answer.body === '') answer = await callOnce(request, name, args, address, token)
  // A tool that reports a problem still says so in words -- most often that the
  // collaboration server is unreachable, which is worth reading rather than
  // discovering as "the block never showed up".
  expect(answer.isError, `${name}: ${answer.body}`).toBeFalsy()
  return { body: answer.body, structured: answer.structured }
}

/**
 * Calls a tool that is expected to refuse, and hands back what it said.
 *
 * Its own function rather than a flag on the one above, so a test that means
 * "this must fail" cannot pass because the call happened to succeed.
 */
export async function refusedMcpTool(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const address = mcpAddress()
  let answer = await callOnce(request, name, args, address, token)
  if (answer.body === '') answer = await callOnce(request, name, args, address, token)
  expect(answer.isError, `${name} should have been refused: ${answer.body}`).toBe(true)
  return answer.body
}
