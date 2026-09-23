import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveBearer } from '@/server/mcp/auth'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'
import { buildMcpServer } from '@/server/mcp/server'
import { unauthorizedChallenge } from '@/server/oauth/metadata'
import { handleThroughNode } from '@/server/mcp/http-bridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The MCP endpoint.
 *
 * Stateless Streamable HTTP: one server per POST, no session store. GET and
 * DELETE are refused because there is nothing to stream from the server side
 * yet -- an SSE channel would buy nothing and cost a session store.
 *
 * The adapter in src/server/mcp/http-bridge.ts is the one place the "Next.js
 * monolith" decision costs something: the SDK speaks Node's req/res, Next
 * speaks Request/Response.
 */
// Presented-token checks, before the database is asked. The secret is 256 bits
// so guessing is not the worry -- an unauthenticated caller driving a query per
// request is.
const tokenChecks = rateLimiter({ limit: 60, windowMs: 60_000 })

export async function POST(request: NextRequest) {
  if (!tokenChecks.take(clientAddress(request.headers))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const authorization = request.headers.get('authorization')
  const actor = await resolveBearer(authorization)

  if (!actor) {
    return new NextResponse(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        // Where to go and what to ask for. Built beside the metadata document
        // it points at, so the two cannot name different scopes.
        'www-authenticate': unauthorizedChallenge(),
      },
    })
  }

  const body = await request.json().catch(() => null)
  if (body === null) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const server = buildMcpServer(actor, authorization ?? '')
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  try {
    await server.connect(transport)
    return await handleThroughNode(request, body, transport)
  } finally {
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }
}

export function GET() {
  return NextResponse.json(
    {
      error: 'method_not_allowed',
      hint: 'MCP over POST. This server does not send anything on its own.',
    },
    { status: 405 },
  )
}

export const DELETE = GET
