import { describe, expect, it, vi } from 'vitest'

/**
 * Claiming an installation: the limit on tries speaks the person's language.
 *
 * It was the one sentence in the setup flow written straight into the action,
 * in German, so somebody setting up an English installation who mistyped the
 * key ten times was told off in a language they may not read.
 */

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}))
const claimInstallation = vi.fn(async () => {
  throw new Error('wrong key')
})
vi.mock('@/server/settings/setup', () => ({ claimInstallation }))
vi.mock('@/server/edition', () => ({ edition: { tenantForSetup: async () => null } }))
vi.mock('@/server/auth/magic-link', () => ({ issueMagicLink: vi.fn() }))
vi.mock('@/server/auth/mail', () => ({
  magicLinkMail: vi.fn(),
  mailConfigFor: vi.fn(),
  sendMail: vi.fn(),
  deliversToRecipient: vi.fn(),
}))

describe('claiming an installation', () => {
  it('answers the eleventh try in a minute from the catalog, not in German', async () => {
    const { claim } = await import('./actions')
    const form = new FormData()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    for (let i = 0; i < 10; i++) await claim(form)
    const result = await claim(form)

    expect(result).toEqual({ ok: false, error: 'errors.tooManyRequests' })
  })
})
