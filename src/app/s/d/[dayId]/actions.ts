'use server'

import { redirect } from 'next/navigation'
import { destroyGuestSession } from '@/server/auth/share-session'

/**
 * Clears the guest cookie and revokes the session row behind it.
 *
 * Sends them to the front page rather than back here, which would 404 and read
 * as a fault. There is nowhere better to go: a guest has no home in the
 * application, and the way back in is the link in their mail.
 */
export async function leaveGuestAccess(): Promise<void> {
  await destroyGuestSession()
  redirect('/')
}
