'use client'

import { useRef, useState } from 'react'
import { Handshake, Minus, Presentation, User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { FieldSpec } from '@/domain/moduleType/profile'
import { cn } from '@/lib/cn'

/**
 * Sozialform, next to the times rather than behind a disclosure.
 *
 * "Is this plenary or small groups" is the question a facilitator answers
 * while reading the clock, so it belongs in the same cell as the clock. It
 * used to be reachable only by expanding the row, which made a field every
 * single block type declares effectively invisible.
 *
 * Icons alone would not do: at 16px nobody tells four arrangements of little
 * people apart, and the state must never be carried by a picture alone. Every
 * option here is an icon AND its word.
 */

const ICONS: Record<string, LucideIcon> = {
  // A room facing one way. `Users` would have been the obvious choice for both
  // this and small groups, and at this size they are the same picture.
  plenary: Presentation,
  small_groups: Users,
  // Two people, unmistakably not three.
  pairs: Handshake,
  individual: User,
  // Absence, not people with a line through them.
  none: Minus,
}

const iconFor = (value: string | undefined): LucideIcon => (value && ICONS[value]) || ICONS.none!

/** What the reading and print views show: the value, or nothing at all. */
export function ParticipationBadge({
  field,
  value,
  className,
}: {
  field: FieldSpec
  value: string | undefined
  className?: string
}) {
  const option = field.options?.find((o) => o.value === value)
  if (!option) return null

  const Icon = iconFor(value)
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[13px] text-[var(--fg-muted)]', className)}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{option.label}</span>
    </span>
  )
}

export function ParticipationControl({
  field,
  value,
  onChange,
}: {
  field: FieldSpec
  value: string | undefined
  /** `undefined` clears the field rather than storing an empty string. */
  onChange: (value: string | undefined) => void
}) {
  const t = useTranslations('agenda')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const options = field.options ?? []

  const selected = options.find((o) => o.value === value)
  const Icon = iconFor(value)

  function choose(next: string) {
    // Picking what is already picked clears it -- otherwise a value set by
    // accident could never be taken back without a separate "none" that means
    // something different from "not answered".
    onChange(next === value ? undefined : next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div
      className="relative"
      // Closes when focus leaves the whole control, the same way the table
      // works out that nobody is in a row any more.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${field.label}: ${selected?.label ?? t('participation.unset')}`}
        title={t('participation.choose')}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          // 44px where there are fingers, and only there. A 44px box around one
          // line of 13px text is not a touch target under a mouse -- it is what
          // turned an 86px row into a 144px one, and a day that no longer fits
          // on a screen is not a calmer table, it is a longer one.
          'inline-flex w-full items-center gap-1 rounded-sm border border-transparent px-1 py-0.5 text-left text-[13px] pointer-coarse:min-h-11',
          'hover:border-[var(--border)] focus-visible:border-[var(--brand-ring)] focus-visible:outline-none',
          // Set: always legible. Unset: out of the way until the row is
          // touched, with a focus-within counterpart because there is no hover
          // on a phone.
          selected
            ? 'text-[var(--fg-muted)]'
            : 'text-[var(--fg-subtle)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{selected?.label ?? t('participation.unset')}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={field.label}
          className="absolute top-full left-0 z-20 mt-0.5 min-w-40 rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
        >
          {options.map((option, index) => {
            const OptionIcon = iconFor(option.value)
            // The button IS the option. A button nested inside a role=option
            // is not a shape assistive technology has to accept, and the li
            // would swallow the click besides.
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  // The first option takes focus when the list opens, so the
                  // keyboard lands somewhere useful.
                  autoFocus={index === 0}
                  onClick={() => choose(option.value)}
                  onKeyDown={(e) => move(e, index, options.length)}
                  className={cn(
                    // The open list is free to be generous: it costs the row
                    // nothing, and this is where a mis-tap is expensive.
                    'flex min-h-11 w-full items-center gap-2 rounded px-2 py-1 text-left text-[14px]',
                    'hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)] focus-visible:outline-none',
                    option.value === value
                      ? 'font-semibold text-[var(--fg)]'
                      : 'text-[var(--fg-muted)]',
                  )}
                >
                  <OptionIcon aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.value === value && (
                    <span aria-hidden className="text-[var(--brand-ring)]">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Roving focus through the list; the buttons are siblings one level down. */
function move(e: React.KeyboardEvent<HTMLButtonElement>, index: number, count: number) {
  const next =
    e.key === 'ArrowDown'
      ? (index + 1) % count
      : e.key === 'ArrowUp'
        ? (index - 1 + count) % count
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? count - 1
            : null

  if (next === null) return
  e.preventDefault()

  const list = e.currentTarget.closest('ul')
  list?.querySelectorAll('button')[next]?.focus()
}
