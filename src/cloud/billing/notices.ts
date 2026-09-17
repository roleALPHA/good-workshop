import { sendMail, type Mail } from '@/server/auth/mail'
import { authConfig } from '@/server/auth/config'
import { translator } from '@/i18n/translator'
import type { Locale } from '@/i18n/config'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import { PLATFORM_TENANT } from '@/server/edition/cloud'
import type { Notice } from './run'

/** The mails the billing worker sends. German until billing accounts remember a language. */
export async function sendNotice(notice: Notice, locale: Locale = 'de'): Promise<void> {
  await sendMail(noticeMail(notice, locale), PLATFORM_TENANT)
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
  return {
    to: notice.to,
    subject: t('subject'),
    text: [t('body', params), '', ATTRIBUTION_TEXT].join('\n'),
  }
}
