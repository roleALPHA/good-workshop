import { NextResponse, type NextRequest } from 'next/server'
import { authConfig } from '@/server/auth/config'
import { activateMembership, consumeMagicLink } from '@/server/auth/magic-link'
import { createSession } from '@/server/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Magic link landing.
 *
 * A GET that changes state, which is unusual and deliberate: the link has to be
 * clickable from a mail client. What makes it safe is that the token is
 * single-use, short-lived, and consumed by an UPDATE ... WHERE consumed_at IS
 * NULL, so a prefetching mail client burns the link rather than replaying it.
 */
export async function GET(request: NextRequest) {
  // Redirect targets come from GW_APP_URL, never from request.url. Behind a
  // reverse proxy -- which is the normal deployment -- request.url carries the
  // container's internal bind address, and the user is sent to
  // http://0.0.0.0:3000 right after a successful login.
  const to = (path: string) => new URL(path, authConfig.appUrl)

  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.redirect(to('/login?error=missing'))

  const consumed = await consumeMagicLink(token)
  if (!consumed) {
    // Expired, already used, or never existed -- deliberately one message. A
    // visitor learns nothing about which.
    return NextResponse.redirect(to('/login?error=invalid'))
  }

  await activateMembership(consumed.identityId, consumed.tenantId)
  await createSession(consumed.identityId, consumed.tenantId, 'magic_link', {
    userAgent: request.headers.get('user-agent') ?? undefined,
  })

  return NextResponse.redirect(to('/'))
}
