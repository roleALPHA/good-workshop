'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { operatorMailLink } from './actions'

/**
 * The way back in when the passkey is gone.
 *
 * The answer never changes: the form says a link is on its way whether or not
 * the address belongs to an operator. The console has no sign-up, so an answer
 * that distinguishes the two is a way to ask who the operators are.
 */
export function MailLinkForm() {
  const t = useTranslations('operator.signIn')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()

  if (sent) {
    return (
      <p role="status" className="mt-6 text-[15px] text-[var(--fg-muted)]">
        {t('mailSent')}
      </p>
    )
  }

  return (
    <form
      className="mt-8 border-t border-[var(--border)] pt-6"
      action={() =>
        start(async () => {
          await operatorMailLink(email)
          setSent(true)
        })
      }
    >
      <h2 className="text-[16px] font-medium">{t('mailTitle')}</h2>
      <p className="mt-1 text-[14px] text-[var(--fg-muted)]">{t('mailIntro')}</p>

      <label htmlFor="operator-email" className="mt-3 block text-[14px] font-medium">
        {t('mailLabel')}
      </label>
      <input
        id="operator-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[16px]"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-3 min-h-11 rounded border border-[var(--border-strong)] px-4 text-[15px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
      >
        {t('mailButton')}
      </button>
    </form>
  )
}
