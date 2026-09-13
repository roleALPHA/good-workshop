import { NextResponse } from 'next/server'
import { authConfig } from '@/server/auth/config'
import { destroySession } from '@/server/auth/session'

export const runtime = 'nodejs'

export async function POST() {
  await destroySession()
  // From GW_APP_URL, not request.url. Behind a reverse proxy -- the normal
  // deployment -- request.url carries the container's internal bind address,
  // and the browser would be sent to http://0.0.0.0:3000.
  return NextResponse.redirect(new URL('/login', authConfig.appUrl), { status: 303 })
}
