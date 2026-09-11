/**
 * A fixed-window counter, in memory.
 *
 * There was no rate limiting anywhere. Three entry points reachable without a
 * session each write a database row per call: requesting a magic link, asking
 * for a passkey challenge, and presenting a token to /api/mcp.
 *
 * Guessing any of the secrets is hopeless -- they are 256 bits -- so this is
 * not about brute force. It is about a stranger mail-bombing a known address
 * through the operator's own relay, and about tables that grow for free.
 *
 * In memory, and therefore per process: with several replicas the effective
 * limit is the limit times the replica count. That is the right trade for the
 * cheap paths, where the cost of an attempt is a lookup and the point is to
 * blunt a flood rather than to count exactly. The magic-link path does not use
 * this -- it counts rows in `email_token`, which is shared and exact, and has
 * carried an index for it since the first migration.
 */
export type RateLimiter = {
  /** Records an attempt. False means this one is over the limit. */
  take: (key: string) => boolean
  /** Live keys, for the test that keeps this from becoming the leak it prevents. */
  size: () => number
}

export type RateLimitOptions = {
  limit: number
  windowMs: number
  /** Injectable so the window can be tested without waiting for it. */
  now?: () => number
}

export function rateLimiter({ limit, windowMs, now = Date.now }: RateLimitOptions): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>()

  /**
   * Swept on write rather than on a timer: a timer would keep the process
   * alive and would run just as often on an idle server. The limiter must not
   * become the memory exhaustion it exists to prevent.
   */
  const prune = (at: number) => {
    for (const [key, window] of windows) {
      if (window.resetAt <= at) windows.delete(key)
    }
  }

  return {
    take(key) {
      const at = now()
      if (windows.size > 1_000) prune(at)

      const window = windows.get(key)
      if (!window || window.resetAt <= at) {
        windows.set(key, { count: 1, resetAt: at + windowMs })
        return true
      }

      window.count += 1
      return window.count <= limit
    },
    size: () => windows.size,
  }
}
