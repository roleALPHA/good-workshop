import { NextResponse, type NextRequest } from 'next/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { authConfig } from '@/server/auth/config'
import { registrationOptions, verifyRegistration } from '@/server/auth/passkey'
import { readSession } from '@/server/auth/session'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Enrolling a passkey, which the application could not do at all until now:
 * signing in WITH one has been possible since the beginning, and there was no
 * screen anywhere to create the first.
 *
 * Both steps require a session. A passkey is a second, stronger key to an
 * account that somebody is already holding open -- an anonymous caller
 * enrolling one would be adding a key to a door they have not opened.
 */
const attempts = rateLimiter({ limit: 20, windowMs: 60_000 })

/** Step one: a challenge, bound to the signed-in identity. */
export async function GET(request: NextRequest) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  if (!attempts.take(clientAddress(request.headers))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  if (!authConfig.passkeysAvailable) {
    // Said in words rather than left to fail in the browser: without HTTPS the
    // prompt never appears, and "nothing happened" is the hardest bug report.
    return NextResponse.json(
      {
        error: 'passkeys_unavailable',
        reason: `Passkeys brauchen HTTPS. Diese Installation läuft auf ${authConfig.appUrl.origin}.`,
      },
      { status: 409 },
    )
  }

  return NextResponse.json(await registrationOptions(session.identityId, session.email))
}

/** Step two: verify what the authenticator signed and store it. */
export async function POST(request: NextRequest) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    nickname?: unknown
    response?: unknown
  } | null
  if (!body?.response) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  // A name the person recognises later. Empty is allowed and becomes a generic
  // label -- being made to name a device before it works is a step nobody wants.
  const nickname =
    typeof body.nickname === 'string' && body.nickname.trim()
      ? body.nickname.trim().slice(0, 80)
      : 'Passkey'

  // Typed at the boundary rather than cast away: verifyRegistration checks the
  // signature, the challenge and the origin, so a malformed body fails there --
  // but the shape it expects should still be named here.
  const verified = await verifyRegistration(
    session.identityId,
    body.response as RegistrationResponseJSON,
    nickname,
  )
  if (!verified) return NextResponse.json({ error: 'verification_failed' }, { status: 400 })

  return NextResponse.json({ ok: true })
}
