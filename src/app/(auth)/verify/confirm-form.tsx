'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { confirmMagicLink } from './actions'

export function ConfirmForm({ token }: { token: string }) {
  const t = useTranslations('auth.verify')
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    const result = await confirmMagicLink(token)
    // FULL navigations, as after a passkey: the session cookie was set by the
    // action, and a client-side navigation would render from a router cache
    // built while there was none. It also takes the token out of the address
    // bar either way.
    window.location.href = result.ok ? '/' : '/login?error=invalid'
  }

  return (
    <form action={submit} className="mt-6">
      <button
        type="submit"
        disabled={pending}
        autoFocus
        className="w-full rounded bg-[var(--brand)] px-4 py-2.5 font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
