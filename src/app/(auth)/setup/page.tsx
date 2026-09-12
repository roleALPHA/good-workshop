import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { needsSetup } from '@/server/settings/setup'
import { SetupForm } from './setup-form'

/**
 * The first-run screen, and only while it is one.
 *
 * Once an administrator exists this route is gone rather than merely hidden --
 * an installation cannot be talked back into its first run. The gate itself is
 * the setup key printed to the server log; see server/settings/setup.ts.
 */
export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login')

  const t = await getTranslations('auth.setup')

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      <SetupForm />
    </div>
  )
}
