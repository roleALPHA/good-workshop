import { NextResponse, type NextRequest } from 'next/server'
import { authConfig } from '@/server/auth/config'
import { authenticationOptions, verifyAuthentication } from '@/server/auth/passkey'
import { createSession } from '@/server/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Step one: hand the browser a challenge. */
export async function GET() {
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
