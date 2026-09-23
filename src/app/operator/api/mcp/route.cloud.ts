import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { NextResponse, type NextRequest } from 'next/server'
import { handleThroughNode } from '@/server/mcp/http-bridge'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'
import { displayVersion } from '@/lib/version'
import { operatorConsoleEnabled, operatorDb } from '@/cloud/operator/db'
import { registerOperatorTools } from '@/cloud/operator/mcp-tools'
import { resolveOperatorBearer } from '@/cloud/operator/tokens'

/**
 * The operator console over MCP.
 *
 * NOT at /api/mcp, and it could not be: that endpoint runs in the public web
 * container as gw_app, and gw_app has EXECUTE on none of the app.op_*
 * functions. Postgres refuses before any code would. This route only works in
 * a process started with GW_OPERATOR_CONSOLE=1 and OPERATOR_DATABASE_URL --
 * which is the console container, reachable only through the tailnet.
 *
 * The 404 below is not belt and braces. A route handler does not run layouts,
 * so the `operatorConsoleEnabled()` check in operator/layout.cloud.tsx does
 * NOT cover this file: the public container has it on disk and has to refuse
 * it itself.
 *
 * `route.cloud.ts`, so a community build does not have the route at all.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The same guard as the customers' endpoint: the secret is 256 bits, so
// guessing is not the worry -- an unauthenticated caller driving a query per
// request is.
const tokenChecks = rateLimiter({ limit: 60, windowMs: 60_000 })

export async function POST(request: NextRequest) {
  if (!operatorConsoleEnabled()) return notHere()

  if (!tokenChecks.take(clientAddress(request.headers))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const actor = await resolveOperatorBearer(
    operatorDb(),
    request.headers.get('authorization'),
  ).catch(() => null)

  if (!actor) {
    // No `WWW-Authenticate` with a metadata document, unlike the customers'
    // endpoint: there is no authorization server to discover and no client
    // registration to offer. An operator token is issued by hand in the
    // console, and pointing a stranger at a flow that does not exist would be
    // an invitation to try.
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  const server = new McpServer(
    { name: 'goodworkshop-operator', version: displayVersion() },
    {
      instructions: [
        'The operator console of a GoodWorkshop cloud installation.',
        'It sees workspaces as figures -- states, plans, counts, invoices -- and never their content.',
        'Blocking a workspace, scheduling its deletion, announcing new terms and writing off a',
        'billing period are staged rather than performed: the tool describes what would happen and',
        'returns a handle, and confirm_operator_action performs it. Show the description to the',
        'person who asked before confirming anything.',
      ].join(' '),
    },
  )
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  try {
    registerOperatorTools(server, actor)
    await server.connect(transport)
    return await handleThroughNode(request, body, transport)
  } finally {
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }
}

/** Indistinguishable from a route that does not exist, because here it does not. */
function notHere() {
  return new NextResponse('Not found', { status: 404 })
}

export function GET() {
  return operatorConsoleEnabled()
    ? NextResponse.json({ error: 'method_not_allowed', hint: 'MCP over POST.' }, { status: 405 })
    : notHere()
}

export const DELETE = GET
