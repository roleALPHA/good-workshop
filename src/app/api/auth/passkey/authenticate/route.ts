import { NextResponse, type NextRequest } from 'next/server'
import { authConfig } from '@/server/auth/config'
import { authenticationOptions, verifyAuthentication } from '@/server/auth/passkey'
import { createSession } from '@/server/auth/session'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Anonymous and it writes a row per call. Nobody legitimately asks for
// challenges faster than this; a script can ask forever.
const challenges = rateLimiter({ limit: 20, windowMs: 60_000 })

/** Step one: hand the browser a challenge. */
export async function GET(request: NextRequest) {
  if (!challenges.take(clientAddress(request.headers))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  if (!authConfig.passkeysAvailable) {
    return NextResponse.json(
      { error: 'passkeys_unavailable', reason: 'WebAuthn requires HTTPS.' },
      { status: 409 },
    )
  }
  return NextResponse.json(await authenticationOptions())
}

/** Step two: verify the signed response and open a session. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const login = await verifyAuthentication(body)
  if (!login) return NextResponse.json({ error: 'verification_failed' }, { status: 401 })

  await createSession(login.identityId, authConfig.defaultTenantId, 'passkey', {
    userAgent: request.headers.get('user-agent') ?? undefined,
  })
  return NextResponse.json({ ok: true })
}
