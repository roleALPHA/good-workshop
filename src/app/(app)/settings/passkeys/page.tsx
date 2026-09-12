import { getTranslations } from 'next-intl/server'
import { loadPasskeys } from '@/server/actions/passkeys'
import { PasskeyList } from './passkey-list'

export const dynamic = 'force-dynamic'

/**
 * Passkeys on your own account.
 *
 * Signing in with one has worked from the beginning; there was simply nowhere
 * to create the first, which made the whole mechanism unreachable on a running
 * installation.
 */
export default async function PasskeysPage() {
  const [result, t] = await Promise.all([loadPasskeys(), getTranslations('settings.passkeys')])

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      {result.ok ? (
        <PasskeyList initial={result.data} />
      ) : (
        <p role="alert" className="text-[15px] text-[var(--fg-muted)]">
          {result.message}
        </p>
      )}
    </div>
  )
}
