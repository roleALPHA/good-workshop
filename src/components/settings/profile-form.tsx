'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateOwnNameAction } from '@/server/actions/profile'

const field =
  'mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-[16px]'

/**
 * Your own first and last name, edited in place.
 *
 * A plain inline form rather than a dialog -- see the inline-editing rule in
 * docs/ui-conventions.md. The hint for a missing name is here rather than a
 * banner across the app: it matters to the person, and only this page can act
 * on it.
 */
export function ProfileForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const t = useTranslations('settings.profile')
  const router = useRouter()
  const [first, setFirst] = useState(firstName)
  const [last, setLast] = useState(lastName)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const missing = firstName.trim() === '' || lastName.trim() === ''
  const changed = first !== firstName || last !== lastName

  function save(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateOwnNameAction({ firstName: first, lastName: last })
      if (!result.ok) {
        setSaved(false)
        setError(result.message)
        return
      }
      setError(null)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="max-w-xl">
      {missing && (
        <p className="mb-3 rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[14px] text-[var(--warn-fg)]">
          {t('missing')}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-first-name" className="text-[14px] font-medium">
            {t('firstName')}
          </label>
          <input
            id="profile-first-name"
            autoComplete="given-name"
            required
            maxLength={100}
            className={field}
            value={first}
            onChange={(e) => {
              setFirst(e.target.value)
              setSaved(false)
            }}
          />
        </div>
        <div>
          <label htmlFor="profile-last-name" className="text-[14px] font-medium">
            {t('lastName')}
          </label>
          <input
            id="profile-last-name"
            autoComplete="family-name"
            required
            maxLength={100}
            className={field}
            value={last}
            onChange={(e) => {
              setLast(e.target.value)
              setSaved(false)
            }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !changed}
          className="min-h-11 rounded bg-[var(--brand)] px-4 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {pending ? t('saving') : t('save')}
        </button>
        {saved && !changed && (
          <p role="status" className="text-[14px] text-[var(--fg-muted)]">
            {t('saved')}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </form>
  )
}
