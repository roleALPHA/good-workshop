import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The boot hook.
 *
 * `auditAuthConfig()` was written, was correct, and was called by nothing: the
 * only reference to it in the entire tree was its own definition. Warnings that
 * are never printed have never prevented anything, so the wiring is what gets
 * asserted here -- not the wording, which has its own table in
 * `server/auth/config.test.ts`.
 *
 * Its own file because a missing module fails a whole suite at import time, and
 * that failure should name this one thing rather than take the config table
 * down with it.
 */

const ENV_KEYS = ['GW_APP_URL', 'GW_MAIL_TRANSPORT'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  vi.resetModules()
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
})

describe('register()', () => {
  it('prints the auth configuration warnings at boot', async () => {
    process.env.GW_APP_URL = 'http://192.168.1.50:3000'
    process.env.GW_MAIL_TRANSPORT = 'console'

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { register } = await import('./instrumentation')
    await register()

    expect(warn.mock.calls.flat().join('\n')).toMatch(/GW_MAIL_TRANSPORT=console/)
  })

  it('says nothing when there is nothing to say', async () => {
    process.env.GW_APP_URL = 'https://ws.example.com'
    process.env.GW_MAIL_TRANSPORT = 'smtp'

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { register } = await import('./instrumentation')
    await register()

    expect(warn).not.toHaveBeenCalled()
  })
})
