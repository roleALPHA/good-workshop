'use client'

import { useState, useTransition } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { removePasskey, type PasskeyPage } from '@/server/actions/passkeys'

/**
 * Enrolling a passkey, and taking one away again.
 *
 * The two-step dance is WebAuthn's: the server hands out a challenge, the
 * browser has the authenticator sign it, the server verifies and stores it.
 * Nothing secret passes through this component -- the private key never leaves
 * the device, which is the entire point of the mechanism.
 */
export function PasskeyList({ initial }: { initial: PasskeyPage }) {
  const [passkeys, setPasskeys] = useState(initial.passkeys)
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()

  async function enrol() {
    setError(null)
    setAdded(false)
    setPending(true)
    try {
      const options = await fetch('/api/auth/passkey/register').then((r) => r.json())
      if (options.error) throw new Error(options.reason ?? 'Die Anfrage wurde abgelehnt.')

      const attestation = await startRegistration({ optionsJSON: options })

      const result = await fetch('/api/auth/passkey/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: attestation, nickname }),
      }).then((r) => r.json())

      if (!result.ok) throw new Error('Der Passkey konnte nicht bestätigt werden.')

      setAdded(true)
      setNickname('')
      // Reloaded rather than patched into state: the server decides the label
      // when the field was left empty, and the row carries timestamps this
      // component would otherwise have to invent.
      window.location.reload()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unbekannter Fehler'
      // A cancelled prompt is a decision, not a failure worth shouting about.
      setError(/abort|cancel|NotAllowed/i.test(message) ? null : message)
    } finally {
      setPending(false)
    }
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await removePasskey({ id })
      if (!result.ok) return setError(result.message)
      setPasskeys((current) => current.filter((row) => row.id !== id))
    })
  }

  return (
    <>
      {!initial.available && (
        <p
          role="alert"
          className="mb-4 rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[14px] text-[var(--warn-fg)]"
        >
          Diese Installation läuft auf <code>{initial.origin}</code>. Browser erlauben Passkeys nur
          über HTTPS (oder auf <code>localhost</code>) — anlegen lässt sich hier keiner. Der
          Anmeldelink per E-Mail bleibt der Weg hinein.
        </p>
      )}

      {passkeys.length > 0 ? (
        <ul className="mb-6 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {passkey.nickname || 'Passkey'}
              </span>
              {passkey.backedUp && (
                <span className="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]">
                  synchronisiert
                </span>
              )}
              <span className="shrink-0 text-[14px] text-[var(--fg-muted)]">
                {passkey.lastUsedAt
                  ? `zuletzt ${new Date(passkey.lastUsedAt).toLocaleDateString('de-DE')}`
                  : 'noch nicht benutzt'}
              </span>
              <button
                type="button"
                onClick={() => remove(passkey.id)}
                aria-label={`${passkey.nickname || 'Passkey'} entfernen`}
                className="shrink-0 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 rounded border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-[15px] text-[var(--fg-muted)]">
          Noch kein Passkey. Bis dahin führt jede Anmeldung über einen Link per E-Mail.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 text-[14px] text-[var(--warn-fg)]">
          {error}
        </p>
      )}
      {added && <p className="mb-3 text-[14px] text-[var(--fg-muted)]">Passkey angelegt.</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="passkey-name" className="text-[14px] font-medium">
            Name (optional)
          </label>
          <input
            id="passkey-name"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="MacBook, iPhone, YubiKey …"
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[15px]"
          />
        </div>
        <button
          type="button"
          onClick={enrol}
          disabled={pending || !initial.available}
          className="rounded bg-[var(--brand-600)] px-4 py-2 text-[15px] font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Warte auf das Gerät …' : 'Passkey anlegen'}
        </button>
      </div>
    </>
  )
}
