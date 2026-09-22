'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { operatorConfirmSignIn } from './actions'

/**
 * The button that spends the sign-in link.
 *
 * The link itself does nothing when it is merely fetched, which is what mail
 * scanners do. Only this submit signs in.
 */
export function ConfirmSignIn({ token }: { token: string }) {
  const t = useTranslations('operator.signIn')
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    const ok = await operatorConfirmSignIn(token)
    // A full navigation, as after a passkey: the session cookie was set by the
    // action, and a client-side navigation would render from a router cache
    // built while there was none. It also takes the token out of the address
    // bar either way.
    window.location.href = ok ? '/operator' : '/operator/login?link=invalid'
  }

  return (
    <form action={submit} className="mt-6">
      <button
        type="submit"
        disabled={pending}
        autoFocus
        className="min-h-11 rounded bg-[var(--brand)] px-4 text-[15px] font-medium text-[var(--brand-fg)] disabled:opacity-60"
      >
        {pending ? t('linkPending') : t('linkButton')}
      </button>
    </form>
  )
}
