import { getTranslations } from 'next-intl/server'
import { loadMailSettings } from '@/server/actions/mail-settings'
import { MailForm } from './mail-form'

export const dynamic = 'force-dynamic'

/**
 * Mail delivery, configurable by the person who runs the installation rather
 * than by whoever has a shell on the server.
 *
 * Credentials entered here are encrypted before they reach the database, so a
 * dump alone cannot send mail as the organisation -- see server/settings.
 */
export default async function MailSettingsPage() {
  const t = await getTranslations('admin.mail')
  const result = await loadMailSettings()

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      {result.ok ? (
        <MailForm initial={result.data} />
      ) : (
        <p role="alert" className="mt-4 text-[15px] text-[var(--fg-muted)]">
          {result.message}
        </p>
      )}
    </div>
  )
}
