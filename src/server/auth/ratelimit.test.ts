import { describe, expect, it } from 'vitest'
import { rateLimiter } from './ratelimit'

/**
 * The throttle that did not exist.
 *
 * A project-wide search for rate limiting found nothing, and three of the
 * reachable-without-a-session entry points write a database row per call:
 * requesting a magic link, asking for a passkey challenge, and presenting a
 * token to /api/mcp.
 *
 * Guessing the secrets is hopeless -- they are 256 bits -- so this is not about
 * brute force. It is about a stranger being able to mail-bomb a known address
 * through the operator's own relay, and about a table that grows for free.
 */
describe('rateLimiter', () => {
  it.each([
    { name: 'lets the first call through', calls: 1, limit: 3, expected: true },
    { name: 'lets calls up to the limit through', calls: 3, limit: 3, expected: true },
    { name: 'blocks the one past the limit', calls: 4, limit: 3, expected: false },
    { name: 'keeps blocking after that', calls: 9, limit: 3, expected: false },
  ])('$name', ({ calls, limit, expected }) => {
    const limiter = rateLimiter({ limit, windowMs: 60_000 })
    let allowed = false
    for (let i = 0; i < calls; i++) allowed = limiter.take('anna@example.test')
    expect(allowed).toBe(expected)
  })

  it('counts each key separately', () => {
    // Otherwise one busy user locks out everybody else, which turns a defence
    // into an outage.
    const limiter = rateLimiter({ limit: 1, windowMs: 60_000 })
    expect(limiter.take('anna@example.test')).toBe(true)
    expect(limiter.take('bert@example.test')).toBe(true)
    expect(limiter.take('anna@example.test')).toBe(false)
  })

  it('forgets once the window has passed', () => {
    let now = 1_000_000
    const limiter = rateLimiter({ limit: 1, windowMs: 60_000, now: () => now })

    expect(limiter.take('anna@example.test')).toBe(true)
    expect(limiter.take('anna@example.test')).toBe(false)

    now += 60_001
    expect(limiter.take('anna@example.test')).toBe(true)
  })

  it('does not grow without bound', () => {
    // The limiter itself must not become the memory exhaustion it prevents.
    const limiter = rateLimiter({ limit: 1, windowMs: 1, now: () => Date.now() })
    for (let i = 0; i < 5_000; i++) limiter.take(`key-${i}`)
    expect(limiter.size()).toBeLessThan(5_000)
  })
})
