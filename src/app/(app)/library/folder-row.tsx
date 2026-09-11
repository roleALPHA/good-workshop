'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { FolderIcon, X } from 'lucide-react'
import { deleteFolderAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'

/**
 * A folder in the sidebar, with a way to remove it.
 *
 * Deleting a folder is a decision about ORDER, not about content: what is
 * inside moves up one level rather than going with it. That is why there is no
 * dire warning here -- nothing is lost, and the label says where things end up.
 */
export function FolderRow({
  id,
  name,
  depth,
  active,
  canDelete,
}: {
  id: string
  name: string
  depth: number
  active: boolean
  canDelete: boolean
}) {
  const t = useTranslations('library')

  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState<string | null>(null)

  function remove() {
    setFailed(null)
    startTransition(async () => {
      const result = await deleteFolderAction({ id })
      if (!result.ok) setFailed(result.message)
    })
  }

  return (
    <li style={{ paddingLeft: depth * 12 }}>
      <div className="group flex items-center gap-1">
        <Link
          href={`/library?folder=${id}`}
          className={`inline-flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-[15px] ${
            active
              ? 'bg-[var(--surface-raised)] font-medium'
              : 'text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]'
          }`}
        >
          <FolderIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{name}</span>
        </Link>

        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            title={t('removeFolder')}
            aria-label={`Ordner ${name} entfernen`}
            className="shrink-0 rounded p-1 text-[var(--fg-subtle)] opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-raised)] focus-visible:opacity-100 disabled:opacity-40"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="px-2 text-[13px] text-[var(--warn-fg)]">
          {failed}
        </p>
      )}
    </li>
  )
}
