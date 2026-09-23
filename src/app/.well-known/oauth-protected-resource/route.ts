import { NextResponse } from 'next/server'
import { currentProfile, protectedResourceMetadata } from '@/server/oauth/metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The document a client fetches after its first 401.
 *
 * Public and unauthenticated on purpose: it is what tells an unauthenticated
 * client where to go and asks for nothing in return.
 *
 * Which endpoint it describes depends on the process, not on the request. In
 * the console container it names /operator/api/mcp; in the web container, the
 * customers' /api/mcp. See `currentProfile`.
 */
export function GET() {
  return NextResponse.json(protectedResourceMetadata(currentProfile()), {
    headers: { 'cache-control': 'public, max-age=3600' },
  })
}
