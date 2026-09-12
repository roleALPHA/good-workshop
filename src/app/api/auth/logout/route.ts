import { NextResponse } from 'next/server'
import { authConfig } from '@/server/auth/config'
import { destroySession } from '@/server/auth/session'

export const runtime = 'nodejs'

export async function POST() {
  await destroySession()
  // From GW_APP_URL, not request.url -- see the note in /verify.
  return NextResponse.redirect(new URL('/login', authConfig.appUrl), { status: 303 })
}
