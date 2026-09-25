'use client'

import { useEffect, useRef, useState } from 'react'
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
 *
 * A chip already in the list is changed by pressing its name, which turns that
 * one chip into a field. Not by putting the text back into the box at the end:
 * Escape empties the box, so the entry the person was fixing would be gone for
 * good, and a committed fix would arrive at the end of the list rather than
 * where it was read. Escape here abandons the change and leaves the chip.
 */
export function ChipsInput({
  values,
  onChange,
  addLabel,
  removeLabel,
  editLabel,
  editFieldLabel,
  placeholder,
  id,
}: {
  values: string[]
  onChange: (next: string[]) => void
  addLabel: string
  /** Takes the chip's own text, so the button says which one it removes. */
  removeLabel: (name: string) => string
  /** Same, for the button that opens the chip for editing. */
  editLabel: (name: string) => string
  /**
   * The field that replaces the chip. A separate string from editLabel: the
   * same words on the button and on the field say nothing about having moved
   * from one to the other, which is the only cue a screen reader gets here.
   */
  editFieldLabel: (name: string) => string
  placeholder?: string
  id?: string
}) {
  const [draft, setDraft] = useState('')
  /**
   * Which chip is open, by its text rather than its index -- somebody else in
   * the room may reorder the list while this one is being typed into.
   */
  const [editing, setEditing] = useState<{ original: string; draft: string } | null>(null)
  const chips = useRef(new Map<string, HTMLButtonElement>())
  /**
   * The chip to put the cursor back on once the list has re-rendered. A ref
   * rather than state: nothing about it belongs on screen, and it is read and
   * cleared in the same breath.
   */
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    const name = pendingFocus.current
    if (name === null) return
    pendingFocus.current = null
    chips.current.get(name)?.focus()
  })

  function add() {
    setDraft('')
    const next = dedupe([...values, ...split(draft)])
    if (next.length !== values.length) onChange(next)
  }

  /**
   * Writes the open chip back where it stood. An entry that has vanished from
   * under us is not resurrected, and a blank is not stored -- removing is what
   * the button beside it is for.
   */
  function commit() {
    if (editing === null) return
    const at = values.indexOf(editing.original)
    setEditing(null)
    if (at === -1) return

    const parts = split(editing.draft)
    if (parts.length === 0) return

    const next = dedupe([...values.slice(0, at), ...parts, ...values.slice(at + 1)])
    if (!same(next, values)) onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] py-0.5 pr-0.5 pl-0.5 text-[13px] text-[var(--fg-muted)]"
        >
          {editing?.original === name ? (
            <input
              type="text"
              aria-label={editFieldLabel(name)}
              autoFocus
              // `size` rather than a width class: a w-* would win over it, and
              // field-sizing is not in mobile Safari yet, which is the target.
              size={Math.max(editing.draft.length + 1, 4)}
              className="max-w-full min-w-0 rounded-sm bg-transparent px-1 text-[13px] focus:outline-none pointer-coarse:text-[16px]"
              value={editing.draft}
              onChange={(e) => setEditing({ original: name, draft: e.target.value })}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Only Enter and Escape hand the focus back. Doing it on blur
                  // too would pull the cursor away from wherever it was clicked.
                  pendingFocus.current = split(editing.draft)[0] ?? name
                  commit()
                }
                if (e.key === 'Escape') {
                  setEditing(null)
                  pendingFocus.current = name
                }
              }}
            />
          ) : (
            <button
              type="button"
              aria-label={editLabel(name)}
              ref={(el) => {
                if (el) chips.current.set(name, el)
                else chips.current.delete(name)
              }}
              onClick={() => setEditing({ original: name, draft: name })}
              className="rounded-sm px-1 hover:bg-[var(--surface-raised)] pointer-coarse:py-1"
            >
              {name}
            </button>
          )}
          <button
            type="button"
            aria-label={removeLabel(name)}
            // Removing the chip that is open: keep it from blurring, which
            // would commit the rename first and leave this click looking for a
            // name that is gone -- the entry would survive, renamed. Any other
            // chip's button lets the blur commit, as leaving a field always
            // does here.
            onMouseDown={editing?.original === name ? (e) => e.preventDefault() : undefined}
            onClick={() => {
              setEditing(null)
              onChange(values.filter((v) => v !== name))
            }}
            className="rounded p-0.5 hover:bg-[var(--surface-raised)] hover:text-[var(--danger-fg)] pointer-coarse:p-1.5"
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

/** "Flipchart, Marker" is two entries, wherever it was typed. */
function split(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * First occurrence wins. Not a nicety: the chips are keyed by their text, so a
 * list holding the same entry twice would not render.
 */
function dedupe(list: string[]): string[] {
  return [...new Set(list)]
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}
