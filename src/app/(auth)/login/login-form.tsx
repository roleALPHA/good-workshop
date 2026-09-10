'use client'

import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { requestMagicLink } from './actions'

export function LoginForm({ passkeysAvailable }: { passkeysAvailable: boolean }) {
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

      if (!result.ok) throw new Error('Der Passkey konnte nicht bestätigt werden.')
      window.location.href = '/'
    } catch (error) {
      // A cancelled prompt is not a failure worth shouting about.
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
      setPasskeyError(/abort|cancel|NotAllowed/i.test(message) ? null : message)
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-6 rounded border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="font-medium">Schau in dein Postfach.</p>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
          Falls es zu dieser Adresse ein Konto gibt, ist ein Anmeldelink unterwegs. Er gilt 15
          Minuten.
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
          Mit Passkey anmelden
        </button>
      ) : (
        <p className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--fg-muted)]">
          Passkeys brauchen HTTPS und sind auf dieser Adresse nicht verfügbar. Der Anmeldelink per
          E-Mail funktioniert.
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
          E-Mail-Adresse
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
          Anmeldelink schicken
        </button>
      </form>
    </div>
  )
}
