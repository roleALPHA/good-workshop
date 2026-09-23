import { sendPlatformMail, type Mail } from '@/server/auth/mail'
import { authConfig } from '@/server/auth/config'
import { translator } from '@/i18n/translator'
import type { Locale } from '@/i18n/config'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import type { Notice } from './run'

/**
 * The mails the billing worker sends, in the language the billing account
 * remembers.
 *
 * Every sentence its message asks for has to be handed over here. next-intl
 * answers a missing placeholder exactly as it answers a missing message -- with
 * the bare key -- so a translated mail whose parameter was forgotten goes out
 * with "subject" as its subject, and nothing upstream can tell. That is what
 * happened to the price and terms announcements; notices.test.ts now walks
 * every kind of notice against every catalog.
 *
 * Configured from the environment alone. The worker runs as the operations
 * role and has no grant on any tenant table, so the usual path -- read what an
 * admin configured in the interface -- cannot work here: it needs the
 * application's database role. That is what made every notice fail with
 * "DATABASE_URL is not set". The operator console had the same fault.
 */
export async function sendNotice(notice: Notice, locale: Locale = 'de'): Promise<void> {
  await sendPlatformMail(noticeMail(notice, locale))
}

export function noticeMail(notice: Notice, locale: Locale): Mail {
  const t = translator(
    locale,
    `mail.billing.${
      notice.kind === 'read_only'
        ? `readOnly.${notice.reason}`
        : notice.kind === 'price_change'
          ? `priceChange.${notice.plan}`
          : notice.kind
    }`,
  )
  const link = new URL('/admin/billing', authConfig.appUrl).toString()
  const day = (date: Date) => date.toISOString().slice(0, 10)
  const params: Record<string, string | number> = { link }
  if (notice.kind === 'trial_ending') params.days = notice.daysLeft
  if (notice.kind === 'payment_failed') {
    params.retry = notice.retryAt ? day(notice.retryAt) : 'none'
  }
  if (notice.kind === 'contract_ended') params.until = day(notice.exportUntil)
  if (notice.kind === 'dunning') params.blockOn = day(notice.blockOn)
  if (notice.kind === 'price_change') {
    params.from = notice.from
    // Euro, because that is what the sentence says and what the customer pays.
    params.price = notice.netCents / 100
  }
  if (notice.kind === 'terms_change') {
    params.from = notice.from
    params.version = notice.version
  }
  return {
    to: notice.to,
    // With the same parameters as the body: the price and terms subjects name
    // the day the change applies, and a subject rendered without them falls
    // back to the word "subject".
    subject: t('subject', params),
    text: [t('body', params), '', ATTRIBUTION_TEXT].join('\n'),
  }
}
