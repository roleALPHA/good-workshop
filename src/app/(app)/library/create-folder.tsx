'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { FolderPlus } from 'lucide-react'
import { createFolderAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'

/** Inline, like everything else that creates something here. */
export function CreateFolder({ parentId }: { parentId: string | null }) {
  const t = useTranslations('library')

  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * Guards against the second commit.
   *
   * The field commits on Enter and on blur, which is right for a field you can
   * leave either way -- but Enter closes it, so the blur that follows used to
   * fire an identical create while the first was still in flight. The second
   * one hits the unique index on (parent, name) and fails, which filled the
   * server log with insert errors for folders that had in fact been created.
   *
   * A ref rather than the transition's `pending`, which only turns true on the
   * next render -- by then both calls are already out.
   */
  const sending = useRef(false)

  function create() {
    if (sending.current || name.trim() === '') return
    sending.current = true
    startTransition(async () => {
      try {
        const result = await createFolderAction({ name: name.trim(), parentId })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setName('')
        setOpen(false)
        router.refresh()
      } finally {
        sending.current = false
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
      >
        <FolderPlus aria-hidden className="size-3.5" />
        {t('newFolder')}
      </button>
    )
  }

  return (
    <div>
      <input
        autoFocus
        aria-label={parentId ? t('subfolderName') : t('folderName')}
        placeholder={t('name')}
        disabled={pending}
        className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-[16px]"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') create()
          if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={create}
      />
      {error && (
        <p role="alert" className="mt-1 text-[13px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </div>
  )
}
