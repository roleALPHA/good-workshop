'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createWorkshopAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'

/**
 * Creating a workshop is one field, inline.
 *
 * No dialog, per the inline-editing rule: the list stays visible while you name
 * the new entry, so you can see what you already have.
 *
 * Where it is filed comes from the address bar, not only from the prop. Two of
 * ten new workshops were reported landing in the wrong folder, and this is why:
 * a prop is one render behind. Clicking a folder starts a navigation, the page
 * for the new folder is fetched, and until it arrives this component still
 * carries the folder the library showed a moment ago -- long enough to type a
 * title and press Enter. The URL changes first, so it is the better answer.
 *
 * The folder is also named next to the field, because the surest fix for filing
 * something in the wrong place is seeing where it goes before it goes there.
 */
export function CreateWorkshop({
  folderId,
  folderName,
}: {
  folderId: string | null
  folderName?: string | null
}) {
  const t = useTranslations('library')
  const tc = useTranslations('common')

  const router = useRouter()
  const params = useSearchParams()
  const target = params.get('folder') ?? folderId
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function create() {
    const trimmed = title.trim()
    if (trimmed === '') return

    startTransition(async () => {
      const result = await createWorkshopAction({ title: trimmed, folderId: target })
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
        className="inline-flex shrink-0 items-center gap-1.5 rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
      >
        <Plus aria-hidden className="size-4" />
        {t('newWorkshop')}
      </button>
    )
  }

  return (
    // Full width on a phone, so it drops below the search instead of pushing
    // "Anlegen" off the edge of the screen.
    <div className="flex w-full items-start gap-2 sm:w-auto">
      <div className="min-w-0 flex-1">
        {folderName && target === folderId && (
          <p className="mb-1 text-[13px] text-[var(--fg-subtle)]">
            {t('filedIn', { folder: folderName })}
          </p>
        )}
        <input
          autoFocus
          aria-label={t('workshopTitle')}
          placeholder={t('workshopTitleExample')}
          className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px] sm:w-56"
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
        {pending ? t('creating') : tc('create')}
      </button>
    </div>
  )
}
