'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { renameWorkshopAction } from '@/server/actions/workshop'

/**
 * The workshop's name above its agenda, renamed in place.
 *
 * Until this existed a workshop could be renamed through MCP and nowhere in
 * the interface: the heading was static text. Edited like a folder in the
 * library -- a button, then the field where the name was, Enter or leaving it
 * saves, Escape abandons -- because one way to rename things is one thing to
 * learn. See the inline-editing rule in docs/ui-conventions.md.
 *
 * The new name shows at once and stays if the server refuses: then the old one
 * comes back with the reason underneath, rather than a heading that claims a
 * name the workshop does not have.
 */
export function WorkshopTitle({
  workshopId,
  title,
  canRename,
}: {
  workshopId: string
  title: string
  /** `workshop.update`: owners, editors and admins. */
  canRename: boolean
}) {
  const t = useTranslations('workshop')
  const router = useRouter()
  const [shown, setShown] = useState(title)
  const [draft, setDraft] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    const next = (draft ?? '').trim()
    setDraft(null)
    if (next === '' || next === shown) return
    const before = shown
    setShown(next)
    setFailed(null)
    startTransition(async () => {
      const result = await renameWorkshopAction({ workshopId, title: next })
      if (!result.ok) {
        setShown(before)
        setFailed(result.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      {draft === null ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{shown}</h1>
          {canRename && (
            <button
              type="button"
              aria-label={t('renameLabel', { name: shown })}
              title={t('rename')}
              disabled={pending}
              onClick={() => setDraft(shown)}
              className="inline-flex size-8 items-center justify-center self-center rounded text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-[var(--brand-ring)]"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <input
          autoFocus
          aria-label={t('renameField', { name: shown })}
          value={draft}
          maxLength={300}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') setDraft(null)
          }}
          className="w-full max-w-xl rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
        />
      )}
      {failed && (
        <p role="alert" className="mt-1 text-[14px] text-[var(--danger-fg)]">
          {failed}
        </p>
      )}
    </div>
  )
}
