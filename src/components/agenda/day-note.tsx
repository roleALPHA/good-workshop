'use client'

import { useEffect, useRef, useState } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import { useTranslations } from 'next-intl'

/**
 * What belongs to the DAY rather than to any one block: the room, how to get
 * in, who brings the flipchart.
 *
 * It used to have nowhere to live. `workshop_day.json_desc` has been in the
 * schema from the start and was written by nothing, so the information went
 * into a block title, or into a chat message, or nowhere.
 *
 * Stored as `{ text }` -- the same field a rich-text description also carries
 * alongside its structure, so this can grow into one without a migration.
 */
export function DayNote({
  doc,
  onChange,
}: {
  doc: DayDoc
  /** Absent for readers: the note is then shown and not editable. */
  onChange?: (desc: Record<string, unknown>) => void
}) {
  const t = useTranslations('agenda')
  const stored = typeof doc.desc?.text === 'string' ? doc.desc.text : ''
  const [text, setText] = useState(stored)

  /**
   * Whether the field is on screen, which is NOT the same as whether it has
   * content.
   *
   * Deriving it from the text collapsed the field back into a button the moment
   * somebody selected everything and deleted it -- mid-edit, with the cursor
   * inside. Clearing a note is a normal thing to do, and it must not take the
   * place you are typing in away with it.
   */
  const [open, setOpen] = useState(Boolean(stored))
  const area = useRef<HTMLTextAreaElement | null>(null)

  // Follows the document: somebody else's edit has to land here too, and only
  // while this field is not the one being typed in.
  useEffect(() => {
    if (document.activeElement !== area.current) setText(stored)
  }, [stored])

  if (!onChange) {
    if (!stored) return null
    return <p className="mt-3 text-[15px] whitespace-pre-line text-[var(--fg-muted)]">{stored}</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-[14px] text-[var(--fg-subtle)] hover:underline"
      >
        {t('addDayNote')}
      </button>
    )
  }

  return (
    <div className="mt-3">
      <label htmlFor="day-note" className="text-[13px] text-[var(--fg-subtle)]">
        {t('dayNote')}
      </label>
      <textarea
        id="day-note"
        ref={area}
        value={text}
        rows={2}
        placeholder={t('dayNotePlaceholder')}
        onChange={(event) => setText(event.target.value)}
        // Written on blur, not on every keystroke: this goes through the shared
        // document to everybody who has the day open, and a character at a time
        // would be a lot of traffic for a field nobody types in for long.
        onBlur={() => {
          const trimmed = text.trim()
          if (trimmed !== stored) onChange(trimmed ? { text: trimmed } : {})
        }}
        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[15px]"
      />
    </div>
  )
}
