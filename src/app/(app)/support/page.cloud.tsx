import { getLocale, getTranslations } from 'next-intl/server'
import { helpUrl } from '@/lib/help'
import { readSessionCached } from '@/server/auth/session'
import { SUPPORT_EMAIL } from '@/cloud/support/address'
import { zammadConfig } from '@/cloud/support/zammad'
import { SupportForm } from './support-form'

export const dynamic = 'force-dynamic'

/**
 * Writing to support from inside the app.
 *
 * Inside rather than a mail link because the app knows what support would ask
 * first -- workspace, role, version, language -- and sends it along; see
 * actions.ts. The help comes first on the page, because most questions are
 * answered there faster than by anybody reading a ticket.
 *
 * Without a configured helpdesk the page says where to write instead of
 * showing a form that can only fail.
 */
export default async function SupportPage() {
  const [t, session, locale] = await Promise.all([
    getTranslations('support'),
    readSessionCached(),
    getLocale(),
  ])
  const configured = zammadConfig() !== null

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mb-3 text-[15px] text-[var(--fg-muted)]">
        {t('intro', { email: session?.email ?? '' })}
      </p>
      <p className="mb-6 text-[15px] text-[var(--fg-muted)]">
        {t('helpFirst')}{' '}
        <a
          href={helpUrl(locale)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {t('helpLink')}
        </a>
      </p>
      {configured ? (
        <SupportForm />
      ) : (
        <p className="rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[15px] text-[var(--warn-fg)]">
          {t('unconfigured', { email: SUPPORT_EMAIL })}
        </p>
      )}
    </div>
  )
}
