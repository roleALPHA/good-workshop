'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { GrantableFolderRole } from '@/domain/workshop/folder-access'
import type { FolderSharingView } from '@/server/actions/folder-sharing'
import {
  removeFolderCollaboratorAction,
  setFolderCollaboratorAction,
} from '@/server/actions/folder-sharing'

/**
 * One row per colleague, one select per row -- the workshop screen's shape.
 *
 * The select offers only what the reader may hand on. A folder viewer therefore
 * gets "no access" and "read" and nothing else: the rule lives in the domain,
 * and a screen that offered "edit" would be asking the server to say no.
 */
export function FolderSharingList({
  folderId,
  createdBy,
  grantable,
  people,
}: {
  folderId: string
  createdBy: string | null
  grantable: readonly GrantableFolderRole[]
  people: FolderSharingView['people']
}) {
  const t = useTranslations('library')
  const tAccess = useTranslations('enums.workshopAccess')
  const router = useRouter()
  const [error, setError] = useState<{ memberId: string; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function change(memberId: string, value: GrantableFolderRole | 'none') {
    startTransition(async () => {
      const result =
        value === 'none'
          ? await removeFolderCollaboratorAction({ folderId, memberId })
          : await setFolderCollaboratorAction({ folderId, memberId, role: value })

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

            {person.access === 'creator' || grantable.length === 0 ? (
              <span className="text-[14px] text-[var(--fg-muted)]">
                {person.access === 'creator' ? t('folderCreator') : tAccess(person.access)}
              </span>
            ) : (
              <select
                aria-label={t('folderAccessOf', { email: person.email })}
                className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[16px]"
                value={person.access}
                disabled={pending}
                onChange={(e) => change(person.id, e.target.value as GrantableFolderRole | 'none')}
              >
                <option value="none">{tAccess('none')}</option>
                {/* Only what this reader holds. `grantable` comes from the same
                    function the server checks against, so the two cannot drift. */}
                {grantable.includes('viewer') && (
                  <option value="viewer">{tAccess('viewer')}</option>
                )}
                {grantable.includes('editor') && (
                  <option value="editor">{tAccess('editor')}</option>
                )}
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
