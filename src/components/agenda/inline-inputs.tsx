'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  formatDuration,
  fromTimeValue,
  parseDuration,
  toTimeValue,
} from '@/features/agenda/duration'
import { cn } from '@/lib/cn'
import { markdownToRichText, richTextToMarkdown } from '@/lib/richtext/markdown'
import type { RichTextValue } from '@/lib/richtext/schema'

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

/**
 * Keeps a textarea exactly as tall as what is in it.
 *
 * Shared by the two fields that wrap, so there is one of these rather than a
 * copy per field. Height goes to `auto` first: `scrollHeight` reports the
 * content height only when the box is not already holding it open.
 */
function useAutoGrow(draft: string) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const textarea = ref.current
    if (!textarea) return

    const resize = () => {
      textarea.style.height = 'auto'
      if (textarea.scrollHeight === 0) return
      // Plus the border, because these boxes are border-box and scrollHeight
      // is not: setting the height to scrollHeight alone leaves the last line
      // a border's worth short, which overflow-hidden then quietly clips.
      const border = textarea.offsetHeight - textarea.clientHeight
      textarea.style.height = `${textarea.scrollHeight + border}px`
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draft])

  return ref
}

/**
 * The name of a row, edited where it is read.
 *
 * A textarea and not an input, because an input cannot wrap: past the width of
 * its column the rest of a long title was simply gone, and the reading view --
 * where the same title is a heading -- showed more of it than the editor did.
 * The editor must not be the worse way to read the agenda.
 *
 * It stays a one-line value for all that. Enter commits with or without Shift,
 * and a pasted line break is folded into a space on the way out, so nothing
 * here can store a newline that the print view would then grow a line for.
 */
export function TitleInput({
  value,
  onCommit,
  placeholder = 'Titel',
  label,
  className,
  autoFocus,
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  /** Defaults to a block's title. A section says what it is instead. */
  label?: string
  /**
   * Replaces the colour, not appended to it: Tailwind's arbitrary values do
   * not resolve by class order, so a second text-[…] would be a coin toss.
   */
  className?: string
  /** For a row that was just created: the cursor belongs in its name. */
  autoFocus?: boolean
}) {
  const t = useTranslations('agenda')
  const [draft, setDraft] = useState(value)
  // Adopted during render, not in an effect -- see the note in search-box.tsx.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }

  const field = useAutoGrow(draft)
  const cancelled = useRef(false)

  // On arrival only, and selected rather than merely focused: a section comes
  // with a placeholder name, and typing should replace it, not append to it.
  // jsdom's select() does not focus on its own, hence both.
  useEffect(() => {
    if (!autoFocus) return
    field.current?.focus()
    field.current?.select()
  }, [autoFocus, field])

  function commit() {
    // Escape is read here rather than acted on there: blur() is delivered
    // synchronously, so a handler that only reset the draft left this one
    // reading the pre-Escape value out of its closure -- and storing exactly
    // the edit somebody had just abandoned.
    if (cancelled.current) {
      cancelled.current = false
      setDraft(value)
      return
    }

    // An emptied name returns rather than being stored: a row with no name
    // cannot be told apart from its neighbours, and a section with no name
    // leaves its own group and its delete button without one either. Same
    // rule as a duration that cannot be read.
    const next = draft.replace(/\s+/g, ' ').trim()
    if (next === '') return setDraft(value)
    if (next !== value) onCommit(next)
  }

  return (
    <textarea
      ref={field}
      rows={1}
      // Honest about the behaviour: Enter commits, so a screen reader must not
      // be promised a line break that never arrives.
      aria-multiline={false}
      aria-label={label ?? t('blockTitle')}
      placeholder={placeholder}
      className={cn(
        bare,
        '-ml-1 min-h-7 resize-none overflow-hidden leading-6 font-semibold break-words pointer-coarse:text-[16px]',
        className ?? 'text-[var(--fg)]',
      )}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Shift or no Shift: a title has no second line, so both commit. The
        // preventDefault is what keeps the keypress from inserting a newline
        // before the blur lands.
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function DescriptionInput({
  value,
  label,
  onCommit,
  className,
}: {
  value: RichTextValue | null
  label: string
  onCommit: (value: RichTextValue | undefined) => void
  className?: string
}) {
  const source = value ? editableMarkdown(value) : ''
  const [draft, setDraft] = useState(source)
  const ref = useAutoGrow(draft)
  const cancelled = useRef(false)
  // Adopt values from collaboration during render, matching the other inline
  // fields and avoiding an extra stale paint after a remote change.
  const [seenSource, setSeenSource] = useState(source)
  if (source !== seenSource) {
    setSeenSource(source)
    setDraft(source)
  }

  function commit() {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(source)
      return
    }

    const next = draft.trim()
    if (next === source.trim()) return
    onCommit(next === '' ? undefined : markdownToRichText(next))
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      placeholder={label}
      className={cn(
        bare,
        'mt-1 -ml-1 min-h-7 resize-none overflow-hidden text-[15px] leading-6 text-[var(--fg-muted)] pointer-coarse:text-[16px]',
        className,
      )}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          cancelled.current = true
          event.currentTarget.blur()
        }
      }}
    />
  )
}

const editableMarkdown = (value: RichTextValue) =>
  richTextToMarkdown(value).replaceAll('  \n', '\n')

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
  const t = useTranslations('agenda')
  const [draft, setDraft] = useState(() => formatDuration(minutes))
  const [invalid, setInvalid] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  const [seenMinutes, setSeenMinutes] = useState(minutes)
  if (minutes !== seenMinutes) {
    setSeenMinutes(minutes)
    setDraft(formatDuration(minutes))
    // A value that arrived from elsewhere is by definition not the one the
    // person mistyped, so the warning goes with it.
    setInvalid(false)
  }

  function commit() {
    // Read here rather than acted on in the key handler, for the reason spelled
    // out in TitleInput: blur() is synchronous, so an Escape that only reset
    // the draft left this function committing the abandoned edit anyway.
    if (cancelled.current) {
      cancelled.current = false
      setDraft(formatDuration(minutes))
      setInvalid(false)
      return
    }

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
      aria-label={t('blockDuration')}
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
          cancelled.current = true
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
