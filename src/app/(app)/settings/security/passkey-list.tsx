'use client'

import { useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
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
  const t = useTranslations('settings.passkeys')
  const tAuth = useTranslations('auth.login')
  const format = useFormatter()
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
      if (options.error) throw new Error(options.reason ?? t('requestRejected'))

      const attestation = await startRegistration({ optionsJSON: options })

      const result = await fetch('/api/auth/passkey/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: attestation, nickname }),
      }).then((r) => r.json())

      if (!result.ok) throw new Error(t('notConfirmed'))

      setAdded(true)
      setNickname('')
      // Reloaded rather than patched into state: the server decides the label
      // when the field was left empty, and the row carries timestamps this
      // component would otherwise have to invent.
      window.location.reload()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : tAuth('unknownError')
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
          {t.rich('unavailable', {
            origin: initial.origin,
            code: (chunks) => <code>{chunks}</code>,
          })}
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
                {passkey.nickname || t('fallbackName')}
              </span>
              {passkey.backedUp && (
                <span className="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]">
                  {t('synced')}
                </span>
              )}
              <span className="shrink-0 text-[14px] text-[var(--fg-muted)]">
                {passkey.lastUsedAt
                  ? t('lastUsed', {
                      date: format.dateTime(new Date(passkey.lastUsedAt), 'short'),
                    })
                  : t('neverUsed')}
              </span>
              <button
                type="button"
                onClick={() => remove(passkey.id)}
                aria-label={t('removeLabel', { name: passkey.nickname || t('fallbackName') })}
                className="shrink-0 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 rounded border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-[15px] text-[var(--fg-muted)]">
          {t('none')}
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 text-[14px] text-[var(--warn-fg)]">
          {error}
        </p>
      )}
      {added && <p className="mb-3 text-[14px] text-[var(--fg-muted)]">{t('added')}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="passkey-name" className="text-[14px] font-medium">
            {t('nameLabel')}
          </label>
          <input
            id="passkey-name"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={t('namePlaceholder')}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[15px]"
          />
        </div>
        <button
          type="button"
          onClick={enrol}
          disabled={pending || !initial.available}
          className="rounded bg-[var(--brand)] px-4 py-2 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {pending ? t('waiting') : t('enrol')}
        </button>
      </div>
    </>
  )
}
