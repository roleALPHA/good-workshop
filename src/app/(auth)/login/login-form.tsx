'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { startAuthentication } from '@simplewebauthn/browser'
import { requestMagicLink } from './actions'

export function LoginForm({
  passkeysAvailable,
  linkTtlMinutes,
}: {
  passkeysAvailable: boolean
  /** Was hardcoded as "15 Minuten" in the prose; it is configurable. */
  linkTtlMinutes: number
}) {
  const t = useTranslations('auth.login')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  async function signInWithPasskey() {
    setPasskeyError(null)
    setPending(true)
    try {
      const options = await fetch('/api/auth/passkey/authenticate').then((r) => r.json())
      if (options.error) throw new Error(options.reason ?? options.error)

      const assertion = await startAuthentication({ optionsJSON: options })
      const result = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(assertion),
      }).then((r) => r.json())

      if (!result.ok) throw new Error(t('passkeyFailed'))
      // A FULL navigation, deliberately, and not `router.push()`. The session
      // cookie was set by the response we just read; a client-side navigation
      // would render from a router cache built while there was no session, and
      // the first thing the person sees after signing in would be the signed-out
      // shell.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
      window.location.href = '/'
    } catch (error) {
      // A cancelled prompt is not a failure worth shouting about.
      const message = error instanceof Error ? error.message : t('unknownError')
      setPasskeyError(/abort|cancel|NotAllowed/i.test(message) ? null : message)
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-6 rounded border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="font-medium">{t('sentTitle')}</p>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
          {t('sentBody', { minutes: linkTtlMinutes })}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      {passkeysAvailable ? (
        <button
          type="button"
          onClick={signInWithPasskey}
          disabled={pending}
          className="w-full rounded bg-[var(--brand)] px-4 py-2.5 font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {t('passkeyButton')}
        </button>
      ) : (
        <p className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--fg-muted)]">
          {t('passkeyUnavailable')}
        </p>
      )}

      {passkeyError && (
        <p role="alert" className="text-[14px] text-[var(--danger-fg)]">
          {passkeyError}
        </p>
      )}

      <form
        action={async (formData) => {
          await requestMagicLink(formData)
          setSent(true)
        }}
        className="space-y-2"
      >
        <label htmlFor="email" className="block text-[14px] font-medium">
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username webauthn"
          className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[16px]"
        />
        <button
          type="submit"
          className="w-full rounded border border-[var(--border-strong)] px-4 py-2.5 font-medium hover:bg-[var(--surface-raised)]"
        >
          {t('send')}
        </button>
      </form>
    </div>
  )
}
