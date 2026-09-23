import { NextResponse, type NextRequest } from 'next/server'
import { registrationEndpoint } from '@/server/oauth/endpoints'
import { openOperatorStore } from '@/cloud/operator/oauth'
import { operatorConsoleEnabled } from '@/cloud/operator/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * RFC 7591 registration, for the console's authorization server.
 *
 * The rules and the rate limit are the customers' endpoint's, shared from
 * src/server/oauth/endpoints.ts. What is different is the store, and what is
 * different about the exposure is the network: this name is only served inside
 * the tailnet (deploy/Caddyfile), so "open registration" here means open to a
 * handful of machines rather than to the internet.
 *
 * The 404 is not belt and braces. A route handler does not run layouts, so the
 * public web container -- which has this file on disk, one image -- has to
 * refuse it itself.
 */
const handler = registrationEndpoint(openOperatorStore)

export async function POST(request: NextRequest) {
  if (!operatorConsoleEnabled()) return new NextResponse('Not found', { status: 404 })
  return handler(request)
}
