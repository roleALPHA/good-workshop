import { sendPlatformMail, type Mail } from '@/server/auth/mail'
import { authConfig } from '@/server/auth/config'
import { translator } from '@/i18n/translator'
import type { Locale } from '@/i18n/config'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import type { Notice } from './run'

/**
 * The mails the billing worker sends. German until billing accounts remember a
 * language.
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
    `mail.billing.${notice.kind === 'read_only' ? `readOnly.${notice.reason}` : notice.kind}`,
  )
  const link = new URL('/admin/billing', authConfig.appUrl).toString()
  const params: Record<string, string | number> = { link }
  if (notice.kind === 'trial_ending') params.days = notice.daysLeft
  if (notice.kind === 'payment_failed') {
    params.retry = notice.retryAt ? notice.retryAt.toISOString().slice(0, 10) : 'none'
  }
  if (notice.kind === 'contract_ended') {
    params.until = notice.exportUntil.toISOString().slice(0, 10)
  }
  return {
    to: notice.to,
    subject: t('subject'),
    text: [t('body', params), '', ATTRIBUTION_TEXT].join('\n'),
  }
}
