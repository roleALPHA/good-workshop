import { NextResponse, type NextRequest } from 'next/server'
import { tokenEndpoint } from '@/server/oauth/endpoints'
import { openOperatorStore } from '@/cloud/operator/oauth'
import { operatorConsoleEnabled } from '@/cloud/operator/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The console's token endpoint. Both grants, shared with the customers' one. */
const handler = tokenEndpoint(openOperatorStore)

export async function POST(request: NextRequest) {
  if (!operatorConsoleEnabled()) return new NextResponse('Not found', { status: 404 })
  return handler(request)
}
