import { NextResponse } from 'next/server'
import { authorizationServerMetadata } from '@/server/oauth/metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(authorizationServerMetadata(), {
    headers: { 'cache-control': 'public, max-age=3600' },
  })
}
