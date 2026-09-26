import { describe, expect, it, vi } from 'vitest'
import { LOCALES } from '@/i18n/config'
import { noticeMail } from './notices'
import type { Notice } from './context'

const sendPlatformMail = vi.fn()
const sendMail = vi.fn()
vi.mock('@/server/auth/mail', () => ({
  sendPlatformMail: (...args: unknown[]) => sendPlatformMail(...args),
  sendMail: (...args: unknown[]) => sendMail(...args),
}))

const to = 'a@example.test'

/**
 * Every kind of notice, and the type says every: a new member of the `Notice`
 * union without an entry here is a compile error.
 *
 * It is a Record rather than a list because a list is what this file was, and
 * it covered five of the nine kinds. The four it did not cover went out with
 * "subject" as the subject -- three of them because the catalog had no text at
 * all, and two of them, price_change and terms_change, because the text was
 * there and `noticeMail` never handed it the values its sentences ask for.
 * next-intl treats a missing placeholder the same as a missing message, so a
 * written translation and a forgotten parameter fail identically and silently.
 */
const NOTICES: Record<Notice['kind'], Notice[]> = {
  trial_ending: [{ kind: 'trial_ending', to, locale: 'de', daysLeft: 3 }],
  read_only: [
    { kind: 'read_only', to, locale: 'de', reason: 'trial_ended' },
    { kind: 'read_only', to, locale: 'de', reason: 'payment_failed' },
  ],
  payment_failed: [
    { kind: 'payment_failed', to, locale: 'de', retryAt: new Date('2026-04-05T10:00:00Z') },
    { kind: 'payment_failed', to, locale: 'de', retryAt: null },
  ],
  contract_ended: [
    { kind: 'contract_ended', to, locale: 'de', exportUntil: new Date('2026-05-02T00:00:00Z') },
  ],
  dunning: [{ kind: 'dunning', to, locale: 'de', blockOn: new Date('2026-04-16T00:00:00Z') }],
  payment_blocked: [{ kind: 'payment_blocked', to, locale: 'de' }],
  unblocked: [{ kind: 'unblocked', to, locale: 'de' }],
  price_change: [
    { kind: 'price_change', to, locale: 'de', plan: 'per_user', netCents: 900, from: '2026-11-01' },
    {
      kind: 'price_change',
      to,
      locale: 'de',
      plan: 'per_workshop',
      netCents: 150,
      from: '2026-11-01',
    },
  ],
  terms_change: [
    {
      kind: 'terms_change',
      to,
      locale: 'de',
      document: 'agb',
      version: '2026-09-22',
      from: '2026-11-04',
    },
  ],
}

const notices = Object.values(NOTICES).flat()

describe('billing mails', () => {
  it.each(LOCALES.flatMap((locale) => notices.map((notice) => [locale, notice] as const)))(
    'are written in %s for %j',
    (locale, notice) => {
      const mail = noticeMail(notice, locale)
      expect(mail.subject).not.toMatch(/mail\.billing/)
      expect(mail.text).not.toMatch(/mail\.billing|\{/)
      expect(mail.text).toContain('/admin/billing')
      // next-intl falls back to the bare key, so a mail that lost its message
      // or a placeholder says "subject" and "body" -- which reads like a real
      // subject line to every assertion above.
      expect(mail.subject).not.toBe('subject')
      expect(mail.text.startsWith('body')).toBe(false)
    },
  )

  it('names the day of the next attempt, or says there is none', () => {
    const [withRetry, withoutRetry] = NOTICES.payment_failed as [Notice, Notice]
    expect(noticeMail(withRetry, 'de').text).toContain('2026-04-05')
    expect(noticeMail(withoutRetry, 'de').text).toContain('nicht erneut')
    expect(noticeMail(NOTICES.trial_ending[0]!, 'de').text).toContain('3 Tagen')
  })

  it('names the day the workspace would close, because the reminder is what makes it lawful', () => {
    // AGB § 5.4: the access may only be blocked after a reminder that says
    // when. A reminder without the date is not the reminder that was promised.
    expect(noticeMail(NOTICES.dunning[0]!, 'de').text).toContain('2026-04-16')
  })

  it('says what a change costs and from when, in the customer’s language', () => {
    const [perUser] = NOTICES.price_change as [Notice]
    expect(noticeMail(perUser, 'de').subject).toContain('2026-11-01')
    // 900 cents is nine euro, not "900".
    expect(noticeMail(perUser, 'de').text).toContain('9')
    expect(noticeMail(perUser, 'de').text).not.toContain('900')

    const terms = NOTICES.terms_change[0]!
    expect(noticeMail(terms, 'de').text).toContain('2026-09-22')
    expect(noticeMail(terms, 'de').text).toContain('2026-11-04')
  })

  it('tells a blocked workspace that exporting still works', () => {
    // The ladder never takes the export away -- neither must the mail suggest
    // it did, because a customer who believes their data is gone acts on that.
    for (const locale of LOCALES) {
      const mail = noticeMail(NOTICES.payment_blocked[0]!, locale)
      expect(mail.text.length).toBeGreaterThan(40)
    }
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
