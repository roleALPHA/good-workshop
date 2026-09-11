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
  const result = await loadMailSettings()

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Mailversand</h1>
      <p className="text-[15px] text-[var(--fg-muted)]">
        Anmeldelinks und Einladungen gehen diesen Weg. Ohne Versand kommt nur hinein, wer schon
        einen Passkey hat.
      </p>

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
