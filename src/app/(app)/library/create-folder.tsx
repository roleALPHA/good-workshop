'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { FolderPlus } from 'lucide-react'
import { createFolderAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'

/** The select needs a value for "nowhere", and an empty one is indistinguishable
 * from "not chosen yet". */
const TOP_LEVEL = 'top'

/**
 * Inline, like everything else that creates something here.
 *
 * Where the new folder goes is a choice, not a consequence of what happens to
 * be selected. It used to be the latter: with a folder open, "+ Ordner" could
 * only make a subfolder of it, and making one at the top level meant leaving
 * the folder first -- which loses the place you were looking at.
 *
 * The selected folder stays the suggestion, because that is what somebody
 * standing in a folder usually wants.
 */
export function CreateFolder({
  parentId,
  parentName,
}: {
  parentId: string | null
  parentName?: string | null
}) {
  const t = useTranslations('library')

  const router = useRouter()
  const params = useSearchParams()
  // The address bar over the prop, for the same reason as in create-workshop:
  // a prop is one render behind a folder that was just clicked.
  const selected = params.get('folder') ?? parentId
  // Null means "follow the library", which is the state this starts in. Freezing
  // the target when the form opens looked equivalent and is not: clicking a
  // folder and creating right away then files it where the library stood a
  // moment ago -- the same staleness that put new workshops in the wrong folder.
  const [chosen, setChosen] = useState<string | null>(null)
  const target = chosen === TOP_LEVEL ? null : (chosen ?? selected)
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
        const result = await createFolderAction({ name: name.trim(), parentId: target })
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
        onClick={() => {
          setChosen(null)
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
      >
        <FolderPlus aria-hidden className="size-3.5" />
        {t('newFolder')}
      </button>
    )
  }

  return (
    <div>
      {selected && (
        <div className="mb-1">
          <label htmlFor="create-folder-in" className="text-[12px] text-[var(--fg-subtle)]">
            {t('createIn')}
          </label>
          <select
            id="create-folder-in"
            value={target ?? ''}
            disabled={pending}
            onChange={(event) => setChosen(event.target.value)}
            className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[16px]"
          >
            {/* The name when the page knows it; the select still has to offer
                the folder itself when it does not. */}
            <option value={selected}>{parentName ?? t('folders')}</option>
            <option value={TOP_LEVEL}>{t('topLevel')}</option>
          </select>
        </div>
      )}
      <input
        autoFocus
        aria-label={target ? t('subfolderName') : t('folderName')}
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
