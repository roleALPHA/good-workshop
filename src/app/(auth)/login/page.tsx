import { redirect } from 'next/navigation'
import { authConfig } from '@/server/auth/config'
import { readSession } from '@/server/auth/session'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  invalid: 'Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.',
  missing: 'Der Link war unvollständig. Fordere einen neuen an.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await readSession()) redirect('/')

  const { error } = await searchParams

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Bei GoodWorkshop anmelden</h1>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
        Ohne Passwort. Entweder per Passkey oder über einen Link per E-Mail.
      </p>

      {error && ERRORS[error] && (
        <p
          role="alert"
          className="mt-4 rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[14px] text-[var(--warn-fg)]"
        >
          {ERRORS[error]}
        </p>
      )}

      <LoginForm passkeysAvailable={authConfig.passkeysAvailable} />
    </div>
  )
}
