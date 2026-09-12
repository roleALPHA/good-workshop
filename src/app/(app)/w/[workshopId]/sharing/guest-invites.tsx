'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { GuestInviteOutcome, SharingView } from '@/server/actions/sharing'
import { inviteGuestAction, revokeGuestAction } from '@/server/actions/sharing'

/**
 * Inviting somebody who has no account.
 *
 * Inline, above the list it adds to, rather than behind a dialog -- the same
 * choice the member invitation makes, for the same reason: a form with two fields
 * does not need a modal, and a modal would hide the list it is about to change.
 */
export function GuestInvites({
  workshopId,
  guests,
  dated,
}: {
  workshopId: string
  guests: SharingView['guests']
  dated: boolean
}) {
  const t = useTranslations('workshop.guests')
  const format = useFormatter()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<GuestInviteOutcome | null>(null)

  function invite(formData: FormData) {
    const email = String(formData.get('email') ?? '')
    const role = String(formData.get('role') ?? 'viewer') as 'editor' | 'viewer'

    startTransition(async () => {
      const result = await inviteGuestAction({ workshopId, email, role })
      if (!result.ok) {
        setError(result.message)
        setOutcome(null)
        return
      }
      setError(null)
      setOutcome(result.data)
      router.refresh()
    })
  }

  function revoke(linkId: string) {
    startTransition(async () => {
      const result = await revokeGuestAction({ workshopId, linkId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setError(null)
      setOutcome(null)
      router.refresh()
    })
  }

  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium' })

  return (
    <section className="mt-8">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('title')}</h2>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>
      <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">
        {dated ? t('until') : t('untilUndated')}
      </p>

      <form action={invite} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="guest-invite-email" className="block text-[14px] font-medium">
            {t('email')}
          </label>
          <input
            id="guest-invite-email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[16px]"
          />
        </div>
        <div>
          <label htmlFor="guest-invite-role" className="block text-[14px] font-medium">
            {t('role')}
          </label>
          <select
            id="guest-invite-role"
            name="role"
            defaultValue="viewer"
            className="mt-1 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[16px]"
          >
            <option value="viewer">{t('roleViewer')}</option>
            <option value="editor">{t('roleEditor')}</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--brand)] px-4 py-2 font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {pending ? t('inviting') : t('invite')}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}

      {outcome?.mailed && (
        <p className="mt-3 text-[14px] text-[var(--fg-muted)]">
          {t('mailed', { email: outcome.email })}
        </p>
      )}

      {/*
        No relay configured, so the invitation has to be passed on by hand. The
        link is shown here and only here -- only its hash is stored, so leaving
        this screen is the last chance to copy it. A member re-inviting the same
        address gets a fresh link, which is the way back from having lost it.
      */}
      {outcome && !outcome.mailed && outcome.link && (
        <div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[14px] text-[var(--fg-muted)]">
            {t('notMailed', { email: outcome.email })}
          </p>
          <p className="mt-2 font-mono text-[13px] break-all">{outcome.link}</p>
        </div>
      )}

      {guests.length === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--fg-muted)]">{t('none')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {guests.map((guest) => (
            <li key={guest.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{guest.email}</p>
                <p className="text-[13px] text-[var(--fg-muted)]">
                  {guest.role === 'editor' ? t('roleEditor') : t('roleViewer')} ·{' '}
                  {guest.lastSeenAt
                    ? t('openedOn', { date: date(guest.lastSeenAt) })
                    : t('neverOpened')}{' '}
                  ·{' '}
                  {guest.expiresAt
                    ? t('validUntil', { date: date(guest.expiresAt) })
                    : t('validUntilRevoked')}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => revoke(guest.id)}
                className="rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                {t('revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
