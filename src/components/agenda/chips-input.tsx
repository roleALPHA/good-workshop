'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

/**
 * A list of short strings, edited as chips.
 *
 * The presentation half of TagEditor, with no opinion about where the value
 * goes: workshop tags reach a server action, a block's materials reach the
 * shared document. Same idiom on screen, because they are the same gesture --
 * type a word, press Enter, it is in the list.
 *
 * Commas split, so a value pasted as "Flipchart, Marker" lands as two chips
 * rather than one long one. Blur adds whatever is in the box, for the same
 * reason nothing in this editor has a save button.
 */
export function ChipsInput({
  values,
  onChange,
  addLabel,
  removeLabel,
  placeholder,
  id,
}: {
  values: string[]
  onChange: (next: string[]) => void
  addLabel: string
  /** Takes the chip's own text, so the button says which one it removes. */
  removeLabel: (name: string) => string
  placeholder?: string
  id?: string
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const parts = draft
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

    setDraft('')
    if (parts.length === 0) return

    const next = [...values]
    for (const part of parts) if (!next.includes(part)) next.push(part)
    if (next.length !== values.length) onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] py-0.5 pr-0.5 pl-1.5 text-[13px] text-[var(--fg-muted)]"
        >
          {name}
          <button
            type="button"
            aria-label={removeLabel(name)}
            onClick={() => onChange(values.filter((v) => v !== name))}
            className="rounded p-0.5 hover:bg-[var(--surface-raised)] hover:text-[var(--danger-fg)]"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}

      <input
        id={id}
        type="text"
        aria-label={addLabel}
        placeholder={placeholder}
        className="w-24 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:bg-[var(--surface)] focus:outline-none pointer-coarse:text-[16px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
          if (e.key === 'Escape') setDraft('')
          // Backspace in an empty box takes the last chip back -- the gesture
          // every chip input has, and the fastest way to undo a typo.
          if (e.key === 'Backspace' && draft === '' && values.length > 0) {
            onChange(values.slice(0, -1))
          }
        }}
      />
    </div>
  )
}
