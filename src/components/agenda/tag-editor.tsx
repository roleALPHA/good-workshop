'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { setTagsAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'

/**
 * Tags on a workshop, edited where the workshop is.
 *
 * Inline, per the rule that governs this product: no dialog between somebody
 * and the thing they are looking at. Typing a name that does not exist yet
 * creates it -- a separate "manage tags" screen you must visit first is a step
 * nobody wants and a screen nobody maintains.
 */
export function TagEditor({ workshopId, initial }: { workshopId: string; initial: string[] }) {
  const t = useTranslations('agenda')
  const [tags, setTags] = useState(initial)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: string[]) {
    const previous = tags
    setTags(next)
    setError(null)
    startTransition(async () => {
      const result = await setTagsAction({ workshopId, tags: next })
      if (!result.ok) {
        // Put it back rather than leave the screen claiming something the
        // server refused.
        setTags(previous)
        setError(result.message)
      }
    })
  }

  function add() {
    const name = draft.trim()
    if (!name || tags.includes(name)) {
      setDraft('')
      return
    }
    setDraft('')
    save([...tags, name])
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded bg-[var(--surface-raised)] py-0.5 pr-1 pl-2 text-[13px] text-[var(--fg-muted)]"
        >
          {name}
          <button
            type="button"
            disabled={pending}
            aria-label={t('removeTag', { name })}
            onClick={() => save(tags.filter((t) => t !== name))}
            className="rounded p-0.5 hover:bg-[var(--surface)] disabled:opacity-50"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}

      <input
        aria-label={t('addTag')}
        placeholder={t('tagPlaceholder')}
        disabled={pending}
        className="w-24 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:bg-[var(--surface)] pointer-coarse:text-[16px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
          if (e.key === 'Escape') setDraft('')
        }}
      />

      {error && (
        <span role="alert" className="text-[13px] text-[var(--danger-fg)]">
          {error}
        </span>
      )}
    </div>
  )
}
