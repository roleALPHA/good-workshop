'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { SharingView } from '@/server/actions/sharing'
import { removeCollaboratorAction, setCollaboratorAction } from '@/server/actions/sharing'
import { useTranslations } from 'next-intl'

/**
 * One row per colleague, one select per row.
 *
 * Everyone in the tenant is listed, including the people who have no access
 * yet: a picker that only shows who is already in makes "add somebody" a
 * second, hidden interaction, and this way granting and revoking are the same
 * gesture.
 */
export function SharingList({
  workshopId,
  ownerId,
  canShare,
  people,
}: {
  workshopId: string
  ownerId: string
  canShare: boolean
  people: SharingView['people']
}) {
  const t = useTranslations('workshop')
  const tAccess = useTranslations('enums.workshopAccess')
  const router = useRouter()
  const [error, setError] = useState<{ memberId: string; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function change(memberId: string, value: 'editor' | 'viewer' | 'none') {
    startTransition(async () => {
      const result =
        value === 'none'
          ? await removeCollaboratorAction({ workshopId, memberId })
          : await setCollaboratorAction({ workshopId, memberId, role: value })

      if (!result.ok) {
        setError({ memberId, message: result.message })
        return
      }
      setError(null)
      router.refresh()
    })
  }

  return (
    <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {people.map((person) => (
        <li key={person.id} className="py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">
                {person.displayName || person.email}
                {person.isSelf && <span className="text-[var(--fg-subtle)]"> · {t('you')}</span>}
              </p>
              {person.displayName && (
                <p className="truncate text-[13px] text-[var(--fg-muted)]">{person.email}</p>
              )}
            </div>

            {person.id === ownerId || !canShare ? (
              <span className="text-[14px] text-[var(--fg-muted)]">{tAccess(person.access)}</span>
            ) : (
              <select
                aria-label={t('accessOf', { email: person.email })}
                className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[16px]"
                value={person.access}
                disabled={pending}
                onChange={(e) => change(person.id, e.target.value as 'editor' | 'viewer' | 'none')}
              >
                <option value="none">{tAccess('none')}</option>
                <option value="viewer">{tAccess('viewer')}</option>
                <option value="editor">{tAccess('editor')}</option>
              </select>
            )}
          </div>

          {error?.memberId === person.id && (
            <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
              {error.message}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
