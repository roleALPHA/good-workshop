import { NextResponse } from 'next/server'
import { runChecks } from '@/server/ops/health'

// The Edge runtime has no TCP, so anything that will eventually talk to
// Postgres has to declare Node explicitly.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Container health.
 *
 * The checks themselves live next door, because a route file may only export
 * HTTP handlers -- and the comparison between what this image expects and what
 * the database has applied is worth testing on its own.
 */
export async function GET() {
  const checks = await runChecks()
  const ok = checks.every((c) => c.ok)

  return NextResponse.json(
    { status: ok ? 'ok' : 'unhealthy', version: process.env.GW_VERSION ?? 'dev', checks },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}
