'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { confirmSignup } from '../actions'

/**
 * The button that spends the link. The page only looks at it: mail scanners
 * fetch links, they do not submit forms -- the same reason as /verify.
 */
export function ConfirmSignup({ token }: { token: string }) {
  const t = useTranslations('site.confirm')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<'invalid' | 'exists' | null>(null)

  async function submit() {
    setPending(true)
    const result = await confirmSignup(token)
    if (result.ok) {
      // A full navigation: the session cookie was set by the action, and a
      // client-side one would render from a router cache built without it.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
      window.location.href = '/library'
      return
    }
    setProblem(result.reason)
    setPending(false)
  }

  if (problem) {
    return (
      <p role="alert" className="mt-6 text-[15px]">
        {t(problem)}{' '}
        <a
          href={problem === 'exists' ? '/login' : '/registrieren'}
          className="underline underline-offset-2"
        >
          →
        </a>
      </p>
    )
  }

  return (
    <form action={submit} className="mt-6">
      <button
        type="submit"
        disabled={pending}
        autoFocus
        className="min-h-11 rounded bg-[var(--brand)] px-5 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        {pending ? t('working') : t('button')}
      </button>
    </form>
  )
}
