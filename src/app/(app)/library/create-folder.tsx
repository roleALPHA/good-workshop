'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FolderPlus } from 'lucide-react'
import { createFolderAction } from '@/server/actions/workshop'

/** Inline, like everything else that creates something here. */
export function CreateFolder({ parentId }: { parentId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function create() {
    if (name.trim() === '') return
    startTransition(async () => {
      const result = await createFolderAction({ name: name.trim(), parentId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setName('')
      setOpen(false)
      router.refresh()
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
        Ordner
      </button>
    )
  }

  return (
    <div>
      <input
        autoFocus
        aria-label={parentId ? 'Name des Unterordners' : 'Name des Ordners'}
        placeholder="Name"
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
