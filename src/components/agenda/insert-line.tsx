'use client'

import { useRef, useState } from 'react'
import { Columns3, Plus, Rows3 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ModuleTypeDto } from '@/domain/agenda/types'
import type { InsertSlot } from '@/features/agenda/insert-slot'
import { cn } from '@/lib/cn'
import { INDENT_PX } from './agenda-dnd'
import { dashed } from './block-picker'
import { BlockTypeList } from './block-type-list'

/**
 * Adding something between two rows rather than at the end of the day.
 *
 * Takes no height of its own: the line sits on the border between two rows, so
 * a day does not grow by one strip per row just to make room for a control
 * that is used now and then. Under a mouse it appears where the pointer
 * crosses that border; a keyboard reaches the "+" like any other button; under
 * a finger the "+" is simply there, because nothing here is revealed by hover
 * alone (docs/ui-conventions.md).
 *
 * The choice it opens is the one below the agenda, inline and not a popover --
 * only shorter, since "here" is already said by where it stands.
 */
export function InsertLine({
  slot,
  anchorTitle,
  open,
  onOpen,
  onClose,
  types,
  onAdd,
  onAddSection,
  onAddBreakout,
}: {
  slot: InsertSlot
  /** The row the line stands under, by name; null above the first row. */
  anchorTitle: string | null
  open: boolean
  onOpen: () => void
  onClose: () => void
  types: ModuleTypeDto[]
  onAdd: (typeKey: string) => void
  /** Absent where a section may not go -- between two blocks of a section. */
  onAddSection?: () => void
  onAddBreakout?: () => void
}) {
  const t = useTranslations('agenda.insert')
  const trigger = useRef<HTMLButtonElement>(null)
  const [choosingType, setChoosingType] = useState(false)
  const indent = slot.depth * INDENT_PX

  // Back to the "+" only when the person backs out. After something was added
  // the focus belongs to what was added; after another line was opened, there.
  const cancel = () => {
    setChoosingType(false)
    onClose()
    trigger.current?.focus()
  }

  const done = (add: () => void) => {
    setChoosingType(false)
    add()
    onClose()
  }

  const label = anchorTitle === null ? t('atStart') : t('after', { title: anchorTitle })

  return (
    <div className="relative">
      <div
        className={cn(
          // One above the rows, whose section headers are z-10 and come later
          // in the document -- level with them, the next header covers the
          // "+". Below the drag handle (z-20), which must stay reachable.
          'group/insert absolute inset-x-0 -top-1.5 z-[11] h-3',
          // Under a finger the strip would swallow taps meant for the rows
          // either side of it; only the "+" itself takes them there.
          'pointer-coarse:pointer-events-none',
        )}
      >
        <div
          aria-hidden
          className={cn(
            'absolute top-1/2 right-0 h-0.5 -translate-y-1/2 rounded-full bg-[var(--brand-ring)] opacity-0 transition-opacity duration-100',
            'group-hover/insert:opacity-100',
            open && 'opacity-100',
          )}
          style={{ left: indent }}
        />
        <button
          ref={trigger}
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={open ? cancel : onOpen}
          className={cn(
            'absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full',
            'border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--fg-muted)]',
            'hover:border-[var(--brand-ring)] hover:text-[var(--fg)]',
            'opacity-0 transition-opacity duration-100 group-hover/insert:opacity-100 focus-visible:opacity-100',
            'pointer-coarse:pointer-events-auto pointer-coarse:opacity-100',
            // 44 px to aim at under a finger, without a 44 px strip in the day.
            'before:absolute before:-inset-2.5 before:content-[""]',
            open && 'opacity-100',
          )}
          style={{ left: `calc(${indent}px + (100% - ${indent}px) / 2)` }}
        >
          <Plus aria-hidden className="size-3.5" />
        </button>
      </div>

      {open && (
        <div
          role="group"
          aria-label={anchorTitle === null ? t('groupStart') : t('group', { title: anchorTitle })}
          className="mx-4 my-2 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3 md:mx-2"
          style={{ marginLeft: indent ? `calc(${indent}px + 0.5rem)` : undefined }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              cancel()
            }
          }}
        >
          {choosingType ? (
            <BlockTypeList
              types={types}
              compact={false}
              onPick={(key) => done(() => onAdd(key))}
              onCancel={cancel}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setChoosingType(true)}
                className={dashed}
              >
                <Plus aria-hidden className="size-4" />
                {t('block')}
              </button>
              {onAddSection && (
                <button type="button" onClick={() => done(onAddSection)} className={dashed}>
                  <Rows3 aria-hidden className="size-4" />
                  {t('section')}
                </button>
              )}
              {onAddBreakout && (
                <button type="button" onClick={() => done(onAddBreakout)} className={dashed}>
                  <Columns3 aria-hidden className="size-4" />
                  {t('breakout')}
                </button>
              )}
              <button
                type="button"
                onClick={cancel}
                className="ml-auto rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface)] pointer-coarse:min-h-11"
              >
                {t('cancel')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
