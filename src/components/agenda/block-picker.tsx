'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { ModuleTypeDto } from '@/domain/agenda/types'
import { formatDuration } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'

/**
 * Adding a block, inline.
 *
 * Expands in place at the end of the day rather than opening a dialog: you pick
 * the kind of block while still looking at the agenda you are adding it to,
 * which is the whole reason to have an agenda on screen.
 */
export function BlockPicker({
  types,
  onAdd,
  disabled,
}: {
  types: ModuleTypeDto[]
  onAdd: (typeKey: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  if (disabled) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-4 my-3 inline-flex items-center gap-1.5 rounded border border-dashed border-[var(--border-strong)] px-3 py-2 text-[15px] text-[var(--fg-muted)] hover:border-[var(--brand-ring)] hover:text-[var(--fg)] md:mx-2"
      >
        <Plus aria-hidden className="size-4" />
        Block hinzufügen
      </button>
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
        aria-label="Blocktyp suchen"
        placeholder="Tippen zum Filtern …"
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
        <p className="mt-2 text-[14px] text-[var(--fg-muted)]">Kein Blocktyp passt dazu.</p>
      )}
    </div>
  )
}
