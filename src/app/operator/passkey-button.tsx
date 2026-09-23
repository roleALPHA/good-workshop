'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import {
  operatorEnroll,
  operatorEnrollmentOptions,
  operatorSignIn,
  operatorSignInOptions,
} from './actions'

/**
 * Signing in, or enrolling the first passkey from a one-time link.
 *
 * `next` is where to land afterwards, and the OAuth consent screen is why it
 * exists: arriving there from an MCP client is a CROSS-SITE navigation, so the
 * console's `sameSite=strict` cookie is withheld and the operator looks signed
 * out even when they are not. That screen therefore offers this button in
 * place of its content and sends the operator back to itself -- by then a
 * same-site navigation, with the cookie attached.
 *
 * It is never read from a query parameter. Every caller passes a literal, or a
 * path it built itself, so there is no value here an attacker supplies.
 */
export function PasskeyButton({ token, next = '/operator' }: { token?: string; next?: string }) {
  const t = useTranslations('operator.signIn')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function go() {
    setPending(true)
    setFailed(false)
    try {
      let ok = false
      if (token) {
        const options = await operatorEnrollmentOptions(token)
        if (options)
          ok = await operatorEnroll(token, await startRegistration({ optionsJSON: options }))
      } else {
        const options = await operatorSignInOptions()
        if (options) ok = await operatorSignIn(await startAuthentication({ optionsJSON: options }))
      }
      if (ok) {
        // A full navigation rather than the router: the cookie was just set,
        // and the next render has to be a fresh request that carries it.
        window.location.href = next
        return
      }
      setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="min-h-11 rounded bg-[var(--brand)] px-4 text-[15px] font-medium text-[var(--brand-fg)] disabled:opacity-60"
      >
        {token ? t('enroll') : t('button')}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-[14px] text-[var(--danger-fg)]">
          {t('failed')}
        </p>
      )}
    </div>
  )
}
