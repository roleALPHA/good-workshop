'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Matches a media query without a hydration mismatch.
 *
 * The server snapshot is always `false`, and so is the client's first render --
 * React therefore sees identical output on both sides and only swaps after the
 * subscription fires. Reading `window.matchMedia` during render instead would
 * make the server emit the mobile tree and the client immediately claim the
 * desktop one, which React reports as a mismatch and fixes by throwing the
 * server HTML away.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/**
 * False until the browser has taken over, true afterwards.
 *
 * The same trick as above and for the same reason: the server and the client's
 * first render must agree. What it buys is a first paint that is readable
 * without waiting for JavaScript -- which matters most on the screen where
 * JavaScript is slowest to arrive.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  )
}

/** Nothing to subscribe to: hydration happens once and never reverts. */
const NEVER_CHANGES = () => () => {}
