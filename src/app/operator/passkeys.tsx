'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { startRegistration } from '@simplewebauthn/browser'
import { operatorAddPasskey, operatorPasskeyOptions, operatorRemovePasskey } from './actions'

/** Dates arrive formatted: the server knows the locale and the time zone. */
type Passkey = { credentialId: string; created: string; lastUsed: string }

/**
 * The passkeys of the operator who is signed in.
 *
 * Adding one needs no link from the server: whoever holds a session has
 * already proven who they are, which is the whole point of letting the mail
 * link be a way back to a passkey rather than a permanent substitute.
 */
export function Passkeys({ passkeys }: { passkeys: Passkey[] }) {
  const t = useTranslations('operator.passkeys')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  // Which one is one click away from being removed. Deleting is irreversible,
  // so the second click is a different button, not a repeat of the first.
  const [confirming, setConfirming] = useState<string | null>(null)

  async function add() {
    setPending(true)
    setFailed(false)
    try {
      const options = await operatorPasskeyOptions()
      const ok =
        options && (await operatorAddPasskey(await startRegistration({ optionsJSON: options })))
      if (ok) window.location.reload()
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  async function remove(credentialId: string) {
    setPending(true)
    if (await operatorRemovePasskey(credentialId)) window.location.reload()
    else {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <div>
      {passkeys.length === 0 ? (
        <p className="mt-4 text-[15px] text-[var(--fg-muted)]">{t('none')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {passkeys.map((passkey) => (
            <li
              key={passkey.credentialId}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="text-[14px]">
                <div>{t('created', { when: passkey.created })}</div>
                <div className="text-[13px] text-[var(--fg-muted)]">
                  {t('lastUsed', { when: passkey.lastUsed })}
                </div>
              </div>
              {confirming === passkey.credentialId ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(passkey.credentialId)}
                    className="min-h-11 rounded bg-[var(--danger-fg)] px-3 text-[14px] font-medium text-[var(--bg)] disabled:opacity-60"
                  >
                    {t('removeConfirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="min-h-11 px-2 text-[14px] underline underline-offset-2"
                  >
                    {t('cancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(passkey.credentialId)}
                  className="min-h-11 rounded border border-[var(--border-strong)] px-3 text-[14px]"
                >
                  {t('remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        disabled={pending}
        className="mt-5 min-h-11 rounded bg-[var(--brand)] px-4 text-[15px] font-medium text-[var(--brand-fg)] disabled:opacity-60"
      >
        {pending ? t('adding') : t('add')}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-[14px] text-[var(--danger-fg)]">
          {t('failed')}
        </p>
      )}
    </div>
  )
}
