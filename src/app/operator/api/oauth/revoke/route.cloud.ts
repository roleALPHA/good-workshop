import { NextResponse, type NextRequest } from 'next/server'
import { revocationEndpoint } from '@/server/oauth/endpoints'
import { openOperatorStore } from '@/cloud/operator/oauth'
import { operatorConsoleEnabled } from '@/cloud/operator/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** RFC 7009, always 200 -- except where the console does not run at all. */
const handler = revocationEndpoint(openOperatorStore)

export async function POST(request: NextRequest) {
  if (!operatorConsoleEnabled()) return new NextResponse('Not found', { status: 404 })
  return handler(request)
}
