import { execFileSync } from 'node:child_process'
import { expect, type APIRequestContext } from '@playwright/test'

/**
 * Calling /api/mcp from a test.
 *
 * One place, because two of the three things below are easy to leave out and
 * neither failure looks like what it is.
 */

let mcpToken: string | undefined

/** One token for the whole run. Creating it shells out, so it is worth keeping. */
export function tokenForMcp(): string {
  mcpToken ??= /gwp_[A-Za-z0-9_-]+/.exec(
    execFileSync(
      'node',
      [
        'scripts/cli.mjs',
        'token',
        'create',
        '--email',
        process.env.E2E_EMAIL ?? 'e2e@example.test',
        '--name',
        'e2e',
        '--scopes',
        'workshops:read,workshops:write',
      ],
      { encoding: 'utf8' },
    ),
  )?.[0]
  if (!mcpToken) throw new Error('Kein MCP-Token aus der CLI')
  return mcpToken
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
): Promise<McpAnswer> {
  const response = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${tokenForMcp()}`,
      accept: 'application/json, text/event-stream',
      'x-forwarded-for': address,
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const body = await response.text()
  expect(response.ok(), `${name}: HTTP ${response.status()} ${body}`).toBeTruthy()

  // The transport is server-sent events, so the JSON sits behind a `data:` line.
  const payload = /^data: (.+)$/m.exec(body)
  if (!payload) return { body: '', structured: {} }

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
  // A tool that reports a problem still says so in words -- most often that the
  // collaboration server is unreachable, which is worth reading rather than
  // discovering as "the block never showed up".
  expect(message.result?.isError, `${name}: ${body}`).toBeFalsy()
  return {
    body: message.result?.content?.[0]?.text ?? '',
    structured: message.result?.structuredContent ?? {},
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
): Promise<McpAnswer> {
  const first = await callOnce(request, name, args, address)
  if (first.body !== '') return first
  return callOnce(request, name, args, address)
}
