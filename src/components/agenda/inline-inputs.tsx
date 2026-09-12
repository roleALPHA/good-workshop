'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
 * A start time is derived from everything above it, which is right until the
 * room is booked for 14:00. Then it is a fact, and the schedule has to bend
 * around it rather than the other way round: the pin holds, and an overrun
 * above it is reported instead of being silently absorbed.
 *
 * Switching it on adopts the time the block currently starts at, so pinning
 * changes nothing by itself -- it only stops the next edit from moving it.
 *
 * Pinned state is never conveyed by colour alone: the lock icon has a label,
 * `aria-pressed` says which way it is, and the time cell repeats it in words.
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
  const t = useTranslations('agenda')
  const pinned = pinnedMinute !== null

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={pinned ? t('pin.clear') : t('pin.set')}
        title={pinned ? t('pin.clear') : t('pin.set')}
        onClick={() => onCommit(pinned ? null : derivedMinute)}
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-transparent',
          'hover:border-[var(--border)] focus-visible:border-[var(--brand-ring)] focus-visible:outline-none',
          // A pin is a state, so it stays visible. An unpinned block offers the
          // lock once the row is touched -- and unconditionally where there are
          // fingers, because there is no hover to reveal it with.
          //
          // `group-focus-within` used to be offered as that counterpart, and it
          // is no counterpart at all: focus follows a tap, and nobody taps a
          // control they cannot see. An opacity-0 button stays hit-testable, so
          // the lock was reachable on a phone the whole time -- just invisible,
          // which is the same as absent.
          pinned
            ? 'text-[var(--fg)]'
            : 'text-[var(--fg-subtle)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
        )}
      >
        {pinned ? (
          <Lock aria-hidden className="size-3.5" />
        ) : (
          <LockOpen aria-hidden className="size-3.5" />
        )}
      </button>

      {pinned && (
        <input
          type="time"
          aria-label={t('pin.time')}
          className="tabular w-[5.5rem] rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[14px] hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:bg-[var(--surface)] focus:outline-none pointer-coarse:text-[16px]"
          value={toTimeValue(pinnedMinute)}
          onChange={(e) => {
            const parsed = fromTimeValue(e.target.value)
            // A half-typed time is not a new start time. Clearing the box is
            // the lock button's job, not a silent unpin.
            if (parsed !== null) onCommit(parsed)
          }}
        />
      )}
    </span>
  )
}

const toTimeValue = (minute: number) =>
  `${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

function fromTimeValue(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}
