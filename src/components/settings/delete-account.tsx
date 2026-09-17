'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { deleteOwnAccountAction } from '@/server/actions/profile'

type Colleague = { id: string; name: string }

/**
 * Deleting your own account, behind a panel that says what happens and asks for
 * the address to be typed -- the same shape as removing a member, because the
 * consequence is the same and it cannot be undone.
 */
export function DeleteAccount({
  email,
  owns,
  colleagues,
}: {
  email: string
  owns: { workshops: number; folders: number }
  colleagues: Colleague[]
}) {
  const t = useTranslations('settings.deleteAccount')
  const [open, setOpen] = useState(false)
  const [successor, setSuccessor] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ownsSomething = owns.workshops > 0 || owns.folders > 0
  const ready =
    typed.trim().toLowerCase() === email.toLowerCase() && (!ownsSomething || successor !== '')

  function confirm() {
    startTransition(async () => {
      const result = await deleteOwnAccountAction({ successorId: successor || null })
      if (!result.ok) {
        setError(result.message)
        return
      }
      // A full navigation: the session cookie is gone.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
      window.location.href = '/login?deleted=1'
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded border border-[var(--border-strong)] px-4 text-[15px] text-[var(--danger-fg)] hover:bg-[var(--surface-raised)]"
      >
        {t('open')}
      </button>
    )
  }

  return (
    <div className="max-w-xl rounded border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[15px] font-medium">{t('heading')}</p>
      <p className="mt-1 text-[14px]">{t('warning')}</p>
      <p className="mt-3 text-[14px]">
        {ownsSomething
          ? t('owns', { workshops: owns.workshops, folders: owns.folders })
          : t('ownsNothing')}
      </p>

      {ownsSomething && (
        <>
          <label
            htmlFor="delete-successor"
            className="mt-2 block text-[13px] text-[var(--fg-muted)]"
          >
            {t('successor')}
          </label>
          <select
            id="delete-successor"
            value={successor}
            onChange={(e) => setSuccessor(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--bg)] px-2 py-2 text-[16px]"
          >
            <option value="">{t('successorPlaceholder')}</option>
            {colleagues.map((colleague) => (
              <option key={colleague.id} value={colleague.id}>
                {colleague.name}
              </option>
            ))}
          </select>
          {colleagues.length === 0 && (
            <p className="mt-1 text-[13px] text-[var(--warn-fg)]">{t('noColleague')}</p>
          )}
        </>
      )}

      <label htmlFor="delete-confirm" className="mt-3 block text-[13px] text-[var(--fg-muted)]">
        {t('typeEmail', { email })}
      </label>
      <input
        id="delete-confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[16px]"
      />

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="min-h-11 rounded border border-[var(--border-strong)] px-3 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending || !ready}
          className="min-h-11 rounded bg-[var(--danger-fg)] px-3 text-[14px] text-[var(--bg)] disabled:opacity-40"
        >
          {t('confirm')}
        </button>
      </div>
    </div>
  )
}
