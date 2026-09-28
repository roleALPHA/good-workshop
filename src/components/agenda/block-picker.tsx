'use client'

import { useState } from 'react'
import { Columns3, Plus, Rows3 } from 'lucide-react'
import type { ModuleTypeDto } from '@/domain/agenda/types'
import { BlockTypeList } from './block-type-list'
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
  onAddBreakout,
  disabled,
}: {
  types: ModuleTypeDto[]
  onAdd: (typeKey: string) => void
  /** Appends a section. Its name is edited in the row it creates. */
  onAddSection: () => void
  /** Appends a breakout, already holding two strands. */
  onAddBreakout?: () => void
  disabled?: boolean
}) {
  const t = useTranslations('agenda')
  const [open, setOpen] = useState(false)

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
        {/*
          A third dashed button in a wrapping row, and not a popover: the two
          hand-built popovers stay two. A breakout is a section with a different
          shape, so it belongs beside the section button rather than inside the
          type list, for the same reason the section button is not in there.
        */}
        {onAddBreakout && (
          <button type="button" onClick={onAddBreakout} className={dashed}>
            <Columns3 aria-hidden className="size-4" />
            {t('breakout.add')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-4 my-3 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3 md:mx-2">
      <BlockTypeList
        types={types}
        compact={false}
        onPick={(key) => {
          onAdd(key)
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}
