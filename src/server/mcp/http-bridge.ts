import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { createServer, type ServerResponse } from 'node:http'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Bridges Next's Request/Response to the Node req/res the SDK expects.
 *
 * A module of its own since there are two MCP endpoints: the customers' one at
 * /api/mcp and the operator console's, which runs in a different process with
 * a different database role. Copied rather than shared, the `x-bridge-key`
 * nonce below is exactly the sort of thing the second copy loses -- and its
 * absence looks like nothing at all until somebody else on the host answers
 * first.
 *
 * A small in-process HTTP server rather than a hand-rolled ServerResponse
 * stand-in: the SDK writes headers, status and a chunked body, and faking all
 * of that correctly is more code and more ways to be subtly wrong than
 * borrowing a real one.
 */
export async function handleThroughNode(
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
