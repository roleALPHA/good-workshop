import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { createServer, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveBearer } from '@/server/mcp/auth'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'
import { buildMcpServer } from '@/server/mcp/server'

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
 * The adapter below is the one place the "Next.js monolith" decision costs
 * something: the SDK speaks Node's req/res, Next speaks Request/Response.
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
        // MCP's direction of travel is OAuth 2.1 for remote servers. Personal
        // access tokens are right for v1; this header is what tells a client
        // that credentials were the problem rather than the request.
        'www-authenticate': 'Bearer realm="GoodWorkshop", error="invalid_token"',
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

/**
 * Bridges Next's Request/Response to the Node req/res the SDK expects.
 *
 * A small in-process HTTP server rather than a hand-rolled ServerResponse
 * stand-in: the SDK writes headers, status and a chunked body, and faking all
 * of that correctly is more code and more ways to be subtly wrong than
 * borrowing a real one.
 */
async function handleThroughNode(
  request: NextRequest,
  body: unknown,
  transport: StreamableHTTPServerTransport,
): Promise<NextResponse> {
  const chunks: Buffer[] = []
  let status = 200
  const headers = new Headers()

  // The bridge listens on loopback for the lifetime of this one request, and a
  // loopback port is reachable by every other process on the host. Without this
  // the first connection to win the race -- not necessarily ours -- would be
  // answered with the already-authenticated caller's context. A nonce costs
  // nothing and closes the window.
  const bridgeKey = randomUUID()

  await new Promise<void>((resolve, reject) => {
    const bridge = createServer((req, res) => {
      if (req.headers['x-bridge-key'] !== bridgeKey) {
        res.writeHead(403).end()
        return
      }

      captureInto(res, chunks, (code, outHeaders) => {
        status = code
        for (const [key, value] of Object.entries(outHeaders)) {
          if (typeof value === 'string') headers.set(key, value)
        }
      })

      transport
        .handleRequest(req, res, body)
        .then(() => resolve())
        .catch(reject)
    })

    bridge.listen(0, '127.0.0.1', () => {
      const address = bridge.address()
      const port = typeof address === 'object' && address ? address.port : 0

      fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: request.headers.get('accept') ?? 'application/json, text/event-stream',
          'x-bridge-key': bridgeKey,
        },
        body: JSON.stringify(body),
      })
        .catch(reject)
        .finally(() => bridge.close())
    })
  })

  if (!headers.has('content-type')) headers.set('content-type', 'application/json')

  return new NextResponse(Buffer.concat(chunks), { status, headers })
}

function captureInto(
  res: ServerResponse,
  chunks: Buffer[],
  onHead: (status: number, headers: Record<string, string | number | string[] | undefined>) => void,
): void {
  const originalWrite = res.write.bind(res)
  const originalEnd = res.end.bind(res)
  const originalWriteHead = res.writeHead.bind(res)

  res.writeHead = ((code: number, ...rest: unknown[]) => {
    const maybeHeaders = rest.find((value) => typeof value === 'object' && value !== null)
    onHead(code, (maybeHeaders as Record<string, string> | undefined) ?? {})
    return originalWriteHead(code, ...(rest as []))
  }) as typeof res.writeHead

  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(Buffer.from(chunk as Buffer))
    return originalWrite(chunk as Buffer, ...(rest as []))
  }) as typeof res.write

  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    if (chunk && typeof chunk !== 'function') chunks.push(Buffer.from(chunk as Buffer))
    return originalEnd(chunk as Buffer, ...(rest as []))
  }) as typeof res.end

  void Readable
}
