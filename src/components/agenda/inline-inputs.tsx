'use client'

import { useEffect, useRef, useState } from 'react'
import { formatDuration, parseDuration } from '@/features/agenda/duration'
import { cn } from '@/lib/cn'

/**
 * Editing happens in the row, with no visible chrome until you touch it.
 *
 * The agenda has to keep reading like a document while you work on it. Boxes
 * around every value turn it into a form, and a dialog puts a mode between the
 * facilitator and the thing they are reading -- which is precisely what a
 * planner must not do.
 */

const bare =
  'w-full rounded-sm border border-transparent bg-transparent px-1 py-0.5 hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:bg-[var(--surface)] focus:outline-none'

export function TitleInput({
  value,
  onCommit,
  placeholder = 'Titel',
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <input
      type="text"
      aria-label="Titel"
      placeholder={placeholder}
      className={cn(bare, '-ml-1 font-semibold text-[var(--fg)]')}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/**
 * The most-used control in the app.
 *
 * Permissive about input (`45`, `1h30`, `1:30`, `1,5h`) and strict about
 * output: anything it cannot read unambiguously reverts rather than guessing.
 * Arrow keys step in five-minute jumps, because that is how agendas are
 * actually adjusted -- a block is rarely three minutes longer.
 */
export function DurationInput({
  minutes,
  onCommit,
}: {
  minutes: number
  onCommit: (minutes: number) => void
}) {
  const [draft, setDraft] = useState(() => formatDuration(minutes))
  const [invalid, setInvalid] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(formatDuration(minutes))
    setInvalid(false)
  }, [minutes])

  function commit() {
    const parsed = parseDuration(draft)
    if (parsed === null) {
      // Reverting beats guessing: a silently wrong duration shifts every
      // following block and is easy to miss.
      setDraft(formatDuration(minutes))
      setInvalid(false)
      return
    }
    setInvalid(false)
    if (parsed !== minutes) onCommit(parsed)
  }

  function step(delta: number) {
    const base = parseDuration(draft) ?? minutes
    const next = Math.min(1440, Math.max(0, base + delta))
    setDraft(formatDuration(next))
    onCommit(next)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="text"
      aria-label="Dauer"
      className={cn(
        bare,
        'tabular -ml-1 w-[5.5rem] font-semibold',
        invalid && 'border-[var(--danger-fg)]',
      )}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        setInvalid(e.target.value !== '' && parseDuration(e.target.value) === null)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setDraft(formatDuration(minutes))
          e.currentTarget.blur()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          step(e.shiftKey ? 15 : 5)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          step(e.shiftKey ? -15 : -5)
        }
      }}
    />
  )
}

/**
 * Pinning a block to a wall-clock time.
 *
 * Pinned state is never conveyed by colour alone -- the lock icon lives in the
 * time cell and this control names the state in words.
 */
export function PinControl({
  pinnedMinute,
  derivedMinute,
  onCommit,
}: {
  pinnedMinute: number | null
  derivedMinute: number
  onCommit: (minute: number | null) => void
}) {
  const value = toTimeValue(pinnedMinute ?? derivedMinute)

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-[13px]">
        <input
          type="checkbox"
          checked={pinnedMinute !== null}
          onChange={(e) => onCommit(e.target.checked ? derivedMinute : null)}
        />
        Startzeit fixieren
      </label>

      {pinnedMinute !== null && (
        <input
          type="time"
          aria-label="Fixierte Startzeit"
          className="tabular rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5 text-[14px]"
          value={value}
          onChange={(e) => {
            const parsed = fromTimeValue(e.target.value)
            if (parsed !== null) onCommit(parsed)
          }}
        />
      )}
    </div>
  )
}

const toTimeValue = (minute: number) =>
  `${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

function fromTimeValue(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}
