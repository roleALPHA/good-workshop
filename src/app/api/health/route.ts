import { NextResponse } from 'next/server'

// The Edge runtime has no TCP, so anything that will eventually talk to
// Postgres has to declare Node explicitly.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Check = { name: string; ok: boolean; detail?: string }

/**
 * Container health.
 *
 * The contract this endpoint is built for: a rolling deploy whose migration has
 * not been applied yet must FAIL its healthcheck rather than serve pages
 * against a schema it does not understand. Every check below is therefore
 * fail-closed -- an unknown state is not a healthy state.
 *
 * Today only the process check exists; the database and migration-version
 * checks land with the Drizzle schema and are wired in here, not somewhere else.
 */
async function runChecks(): Promise<Check[]> {
  return [{ name: 'process', ok: true }]
}

export async function GET() {
  const checks = await runChecks()
  const ok = checks.every((c) => c.ok)

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'unhealthy',
      version: process.env.GW_VERSION ?? 'dev',
      checks,
    },
    {
      status: ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
