'use client'

import { useState } from 'react'
import { Plus, Rows3 } from 'lucide-react'
import type { ModuleTypeDto } from '@/domain/agenda/types'
import { formatDuration } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { useTranslations } from 'next-intl'

const dashed =
  'inline-flex items-center gap-1.5 rounded border border-dashed border-[var(--border-strong)] px-3 py-2 text-[15px] text-[var(--fg-muted)] hover:border-[var(--brand-ring)] hover:text-[var(--fg)]'

/**
 * Adding a block or a section, inline.
 *
 * Expands in place at the end of the day rather than opening a dialog: you pick
 * the kind of block while still looking at the agenda you are adding it to,
 * which is the whole reason to have an agenda on screen.
 *
 * Two peer buttons, because those are the two things that go at the end of a
 * day. While the type list is open it is the only thing on screen: you are in
 * the middle of one choice, and a live second button next to a filter field is
 * a stray tab stop.
 */
export function BlockPicker({
  types,
  onAdd,
  onAddSection,
  disabled,
}: {
  types: ModuleTypeDto[]
  onAdd: (typeKey: string) => void
  /** Appends a section. Its name is edited in the row it creates. */
  onAddSection: () => void
  disabled?: boolean
}) {
  const t = useTranslations('agenda')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  if (disabled) return null

  if (!open) {
    return (
      <div className="mx-4 my-3 flex flex-wrap items-center gap-2 md:mx-2">
        <button type="button" onClick={() => setOpen(true)} className={dashed}>
          <Plus aria-hidden className="size-4" />
          {t('addBlock')}
        </button>
        {/*
          Beside the block button, not an entry in the type list below. That
          list is module types -- each with a colour bar, a default duration and
          a key that `onAdd` commits. A section has none of those, and a
          pretend type would take the filter's first match with it.
        */}
        <button type="button" onClick={onAddSection} className={dashed}>
          <Rows3 aria-hidden className="size-4" />
          {t('section.add')}
        </button>
      </div>
    )
  }

  const matches = types.filter((type) =>
    type.name.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  return (
    <div className="mx-4 my-3 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3 md:mx-2">
      <input
        autoFocus
        type="text"
        aria-label={t('searchType')}
        placeholder={t('filterPlaceholder')}
        className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px]"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && matches[0]) {
            onAdd(matches[0].key)
            setOpen(false)
            setFilter('')
          }
        }}
      />

      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {matches.map((type) => (
          <li key={type.id}>
            <button
              type="button"
              onClick={() => {
                onAdd(type.key)
                setOpen(false)
                setFilter('')
              }}
              className={cn(
                catClass(type.color),
                'flex w-full items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-left hover:border-[var(--cat-bar)]',
              )}
            >
              <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-[var(--cat-bar)]" />
              <span className="min-w-0 flex-1 truncate text-[15px]">{type.name}</span>
              <span className="tabular shrink-0 text-[13px] text-[var(--fg-subtle)]">
                {formatDuration(type.defaultDurationMinutes)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {matches.length === 0 && (
        <p className="mt-2 text-[14px] text-[var(--fg-muted)]">{t('noTypeMatches')}</p>
      )}
    </div>
  )
}
