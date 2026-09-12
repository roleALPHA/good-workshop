'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { openSharedAgenda } from './actions'

/**
 * The second factor, as a form.
 *
 * A guest types the address their invitation went to. Not a nicety: the link
 * travels through a mail client, a forwarded message, a browser history and
 * whatever a phone syncs to, and on its own it opens nothing.
 */
export function GateForm({ token }: { token: string }) {
  const t = useTranslations('auth.guest')
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Controlled, so a rejected attempt keeps what was typed.
   *
   * React resets a form once its action resolves, which after a wrong address
   * would empty the field and make somebody who mistyped one character retype
   * the whole thing -- on a phone, from an address they have to go back to their
   * mail to read. It also raced: the reset lands after the error renders, so
   * anything written in between is wiped.
   */
  const [email, setEmail] = useState('')

  async function submit(formData: FormData) {
    setError(null)
    setPending(true)
    const result = await openSharedAgenda(token, formData)

    if (result.ok) {
      // Straight off the token URL. From here on the cookie is the credential,
      // so the token stops appearing in Referer headers, in the address bar and
      // in whatever the browser syncs.
      router.replace(`/s/d/${result.dayId}`)
      return
    }

    setPending(false)
    setError(t(result.reason === 'tooMany' ? 'tooMany' : 'rejected'))
  }

  return (
    <form action={submit} className="mt-6 space-y-3">
      <div>
        <label htmlFor="guest-email" className="block text-[14px] font-medium">
          {t('email')}
        </label>
        <input
          id="guest-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          // 16px on a coarse pointer, or iOS zooms the page when it is focused
          // -- and this form is opened on a phone more often than not.
          className="mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[16px]"
        />
      </div>

      {error && (
        <p role="alert" className="text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-[var(--brand)] px-4 py-2.5 font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        {pending ? t('opening') : t('open')}
      </button>
    </form>
  )
}
