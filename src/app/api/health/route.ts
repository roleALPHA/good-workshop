import { NextResponse } from 'next/server'
import { publicReport, runChecks } from '@/server/ops/health'

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
export async function GET(request: Request) {
  const checks = await runChecks()
  const ok = checks.every((c) => c.ok)

  // The container's own HEALTHCHECK and an operator on the inside get the
  // detail; the internet gets the verdict. A shared header rather than a
  // session, because this endpoint has to answer while the database -- and
  // therefore every session -- is exactly what is broken.
  const secret = process.env.GW_OPS_TOKEN
  const detailed = Boolean(secret) && request.headers.get('x-ops-token') === secret

  return NextResponse.json(publicReport(checks, process.env.GW_VERSION ?? 'dev', { detailed }), {
    status: ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}
