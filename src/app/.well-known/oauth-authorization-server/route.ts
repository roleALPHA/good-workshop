import { NextResponse } from 'next/server'
import { authorizationServerMetadata, currentProfile } from '@/server/oauth/metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One route, two answers.
 *
 * In the web container this describes the customers' authorization server; in
 * the console container -- same image, GW_OPERATOR_CONSOLE=1 -- it describes
 * the operator's. The choice is `currentProfile()` and is a property of the
 * process, never of the request: a document assembled from the Host header is
 * one an attacker can aim somewhere else.
 */
export function GET() {
  return NextResponse.json(authorizationServerMetadata(currentProfile()), {
    headers: { 'cache-control': 'public, max-age=3600' },
  })
}
