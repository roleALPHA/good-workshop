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

/** Signing in, or enrolling the first passkey from a one-time link. */
export function PasskeyButton({ token }: { token?: string }) {
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
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full navigation after the cookie was set
        window.location.href = '/operator'
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
