import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { needsSetup } from '@/server/settings/setup'

/**
 * Nothing to describe: this page only ever redirects, and a self-hosted
 * installation has no public website to be found in a search index.
 *
 * It exists because src/app/page.tsx re-exports whichever front page the build
 * has, and the cloud's carries a canonical and an hreflang block.
 */
export function generateMetadata(): Metadata {
  return {}
}

/**
 * The address somebody types is the one they expect to get in through.
 *
 * Three destinations, in the order they become true: an installation nobody has
 * claimed yet goes to /setup, everything else to /library -- which sends a
 * visitor without a session on to /login itself, so there is no second session
 * check here that could drift from the first.
 */
export default async function CommunityHome() {
  // A database that is not reachable must not turn the front page into a stack
  // trace: /library and the health endpoint both report that far better.
  // Two calls rather than a ternary inside redirect(): typedRoutes checks the
  // literal, and a union of two routes is not one it can verify.
  if (await needsSetup().catch(() => false)) redirect('/setup')
  redirect('/library')
}
