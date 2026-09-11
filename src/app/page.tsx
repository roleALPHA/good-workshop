import { redirect } from 'next/navigation'
import { needsSetup } from '@/server/settings/setup'

/**
 * The address somebody types is the one they expect to get in through.
 *
 * Three destinations, in the order they become true: an installation nobody has
 * claimed yet goes to /setup, everything else to /library -- which sends a
 * visitor without a session on to /login itself, so there is no second session
 * check here that could drift from the first.
 */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // A database that is not reachable must not turn the front page into a stack
  // trace: /library and the health endpoint both report that far better.
  // Two calls rather than a ternary inside redirect(): typedRoutes checks the
  // literal, and a union of two routes is not one it can verify.
  if (await needsSetup().catch(() => false)) redirect('/setup')
  redirect('/library')
}
