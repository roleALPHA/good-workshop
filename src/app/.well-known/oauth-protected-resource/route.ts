import { NextResponse } from 'next/server'
import { protectedResourceMetadata } from '@/server/oauth/metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The document a client fetches after its first 401.
 *
 * Public and unauthenticated on purpose: it is what tells an unauthenticated
 * client where to go and asks for nothing in return.
 */
export function GET() {
  return NextResponse.json(protectedResourceMetadata(), {
    headers: { 'cache-control': 'public, max-age=3600' },
  })
}
