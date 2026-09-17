import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/i18n/config'
import { noticeMail } from './notices'
import type { Notice } from './run'

const notices: Notice[] = [
  { kind: 'trial_ending', to: 'a@example.test', daysLeft: 3 },
  { kind: 'payment_failed', to: 'a@example.test', retryAt: new Date('2026-04-05T10:00:00Z') },
  { kind: 'payment_failed', to: 'a@example.test', retryAt: null },
  { kind: 'read_only', to: 'a@example.test', reason: 'trial_ended' },
  { kind: 'read_only', to: 'a@example.test', reason: 'payment_failed' },
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
