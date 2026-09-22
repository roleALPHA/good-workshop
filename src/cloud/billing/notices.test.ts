import { describe, expect, it, vi } from 'vitest'
import { LOCALES } from '@/i18n/config'
import { noticeMail } from './notices'
import type { Notice } from './run'

const sendPlatformMail = vi.fn()
const sendMail = vi.fn()
vi.mock('@/server/auth/mail', () => ({
  sendPlatformMail: (...args: unknown[]) => sendPlatformMail(...args),
  sendMail: (...args: unknown[]) => sendMail(...args),
}))

const to = 'a@example.test'
const notices: Notice[] = [
  { kind: 'trial_ending', to, locale: 'de', daysLeft: 3 },
  { kind: 'payment_failed', to, locale: 'de', retryAt: new Date('2026-04-05T10:00:00Z') },
  { kind: 'payment_failed', to, locale: 'de', retryAt: null },
  { kind: 'read_only', to, locale: 'de', reason: 'trial_ended' },
  { kind: 'read_only', to, locale: 'de', reason: 'payment_failed' },
]

describe('billing mails', () => {
  it.each(LOCALES.flatMap((locale) => notices.map((notice) => [locale, notice] as const)))(
    'are written in %s for %j',
    (locale, notice) => {
      const mail = noticeMail(notice, locale)
      expect(mail.subject).not.toMatch(/mail\.billing/)
      expect(mail.text).not.toMatch(/mail\.billing|\{/)
      expect(mail.text).toContain('/admin/billing')
    },
  )

  it('names the day of the next attempt, or says there is none', () => {
    expect(noticeMail(notices[1]!, 'de').text).toContain('2026-04-05')
    expect(noticeMail(notices[2]!, 'de').text).toContain('nicht erneut')
    expect(noticeMail(notices[0]!, 'de').text).toContain('3 Tagen')
  })
})

describe('how the worker sends them', () => {
  /**
   * The worker runs as the operations role and has no application database.
   * Reading a tenant's mail settings therefore fails with "DATABASE_URL is not
   * set", every notice is lost, and -- because a throwing notice used to undo
   * the work that preceded it -- a failed charge looked like an unpaid invoice
   * and nobody was ever locked. The console had the same fault and was fixed
   * the same way.
   */
  it('reads the configuration from the environment, never from a tenant', async () => {
    const { sendNotice } = await import('./notices')
    sendPlatformMail.mockResolvedValue(undefined)

    await sendNotice({ kind: 'read_only', to, locale: 'de', reason: 'trial_ended' })

    expect(sendPlatformMail).toHaveBeenCalledTimes(1)
    expect(sendMail).not.toHaveBeenCalled()
  })
})
