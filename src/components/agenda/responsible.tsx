'use client'

import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  initials,
  normalizeResponsible,
  resolveResponsible,
  responsibleFromInput,
  type AssignablePerson,
  type ResolvedResponsible,
  type Responsible,
} from '@/domain/agenda/responsible'
import { cn } from '@/lib/cn'

/**
 * Who answers for a block, readable at a glance.
 *
 * Directly under the title rather than among the chips in the info column: the
 * question "whose is this?" is asked of every row, and the answer belongs where
 * the eye already is. A face-sized mark with initials reads as a person before
 * the name is read at all.
 *
 * Somebody from outside the workspace says so in words, not only in the dashed
 * outline -- no state is carried by a line style alone.
 */
export function ResponsibleList({
  people,
  className,
}: {
  people: ResolvedResponsible[]
  className?: string
}) {
  const t = useTranslations('agenda.responsible')
  if (people.length === 0) return null

  return (
    <ul aria-label={t('label')} className={cn('flex flex-wrap gap-1', className)}>
      {people.map((person) => (
        <li key={keyOf(person)} className={CHIP} title={hint(person, t)}>
          <PersonMark person={person} />
          <span className="min-w-0 truncate">{person.name}</span>
          {person.external && <External label={t('external')} />}
        </li>
      ))}
    </ul>
  )
}

/**
 * The same chips, editable where they are read.
 *
 * Type a name and press Enter, as with material. A member's exact name makes it
 * that member -- the suggestions under the field are the way to get there from
 * a partial one -- and any other name is somebody from outside.
 *
 * The suggestions are a native `<datalist>` rather than a popover of our own:
 * iOS offers them above the keyboard itself, and docs/ui-conventions.md is
 * explicit about thinking twice before a second hand-rolled popover.
 */
export function ResponsibleInput({
  value,
  people = [],
  onChange,
}: {
  value: Responsible[]
  /** The workspace's members. Empty where nobody may be offered, e.g. for a guest. */
  people?: AssignablePerson[]
  onChange: (next: Responsible[]) => void
}) {
  const t = useTranslations('agenda.responsible')
  const [draft, setDraft] = useState('')
  const listId = useId()
  const resolved = resolveResponsible(value, people)

  const assigned = new Set(value.map((entry) => entry.memberId).filter(Boolean))
  const suggestions = people.filter((person) => !assigned.has(person.id))

  function add() {
    const entry = responsibleFromInput(draft, people)
    setDraft('')
    if (!entry) return
    const next = normalizeResponsible([...value, entry])
    if (next.length !== value.length) onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {resolved.map((person, index) => (
        <span key={keyOf(person)} className={cn(CHIP, 'pr-0.5')} title={hint(person, t)}>
          <PersonMark person={person} />
          <span className="min-w-0 truncate">{person.name}</span>
          {person.external && <External label={t('external')} />}
          <button
            type="button"
            aria-label={t('remove', { name: person.name })}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="rounded-full p-0.5 text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--danger-fg)]"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}

      <input
        type="text"
        aria-label={t('add')}
        placeholder={t('placeholder')}
        list={suggestions.length > 0 ? listId : undefined}
        autoComplete="off"
        className="w-32 min-w-32 flex-1 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:bg-[var(--surface)] focus:outline-none pointer-coarse:text-[16px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
          if (e.key === 'Escape') setDraft('')
          if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((person) => (
            <option key={person.id} value={person.name} />
          ))}
        </datalist>
      )}
    </div>
  )
}

const CHIP =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] py-0.5 pr-2 pl-0.5 text-[13px] font-medium text-[var(--fg)]'

function PersonMark({ person }: { person: ResolvedResponsible }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full text-[10px] leading-none font-semibold',
        person.external
          ? 'border border-dashed border-[var(--fg-subtle)] text-[var(--fg-muted)]'
          : 'bg-[var(--fg)] text-[var(--surface)]',
      )}
    >
      {initials(person.name)}
    </span>
  )
}

function External({ label }: { label: string }) {
  return <span className="font-normal text-[var(--fg-subtle)]">{label}</span>
}

const keyOf = (person: Responsible) => person.memberId ?? `name:${person.name.toLowerCase()}`

function hint(
  person: ResolvedResponsible,
  t: ReturnType<typeof useTranslations<'agenda.responsible'>>,
): string {
  return person.external ? t('externalHint') : t('memberHint')
}
