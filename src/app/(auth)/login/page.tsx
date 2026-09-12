import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { authConfig } from '@/server/auth/config'
import { readSessionCached } from '@/server/auth/session'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

const ERRORS = {
  invalid: 'linkExpired',
  missing: 'linkIncomplete',
} as const

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await readSessionCached()) redirect('/')

  const [{ error }, t] = await Promise.all([searchParams, getTranslations('auth.login')])
  const key = error && error in ERRORS ? ERRORS[error as keyof typeof ERRORS] : null

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      {key && (
        <p
          role="alert"
          className="mt-4 rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[14px] text-[var(--warn-fg)]"
        >
          {t(key)}
        </p>
      )}

      <LoginForm
        passkeysAvailable={authConfig.passkeysAvailable}
        linkTtlMinutes={authConfig.magicLinkTtlMinutes}
      />
    </div>
  )
}
