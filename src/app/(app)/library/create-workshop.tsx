'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createWorkshopAction } from '@/server/actions/workshop'

/**
 * Creating a workshop is one field, inline.
 *
 * No dialog, per the inline-editing rule: the list stays visible while you name
 * the new entry, so you can see what you already have.
 */
export function CreateWorkshop({ folderId }: { folderId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function create() {
    const trimmed = title.trim()
    if (trimmed === '') return

    startTransition(async () => {
      const result = await createWorkshopAction({ title: trimmed, folderId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      // Straight into the new workshop: a freshly created plan you then have to
      // find in a list is a step nobody wants.
      router.push(`/w/${result.data.workshopId}`)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
      >
        <Plus aria-hidden className="size-4" />
        Neuer Workshop
      </button>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div>
        <input
          autoFocus
          aria-label="Titel des Workshops"
          placeholder="z. B. Strategie-Retreat"
          className="w-56 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px]"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-[var(--danger-fg)]">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={create}
        disabled={pending || title.trim() === ''}
        className="rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        {pending ? 'Anlegen …' : 'Anlegen'}
      </button>
    </div>
  )
}
