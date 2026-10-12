'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { lockKey } from '@/domain/collab/locks'
import type { Peer } from '@/features/agenda/document'
import { cn } from '@/lib/cn'
import { describe, hueStyle } from './presence'

/**
 * The fields somebody else holds, for every field in the editor to look up.
 *
 * A context rather than a prop on every row: a lock applies to a field
 * wherever it is rendered -- in the row, behind "Mehr Felder", in a strand --
 * and threading it through each of those would mean every new field has to
 * remember to opt in. Empty outside the editor, so a reader is never locked.
 */
const FieldLocks = createContext<ReadonlyMap<string, Peer>>(new Map())

export const FieldLockProvider = FieldLocks.Provider

/** Who holds this field, if it is somebody else. */
export function useFieldHolder(blockId: string, field: string): Peer | null {
  return useContext(FieldLocks).get(lockKey(blockId, field)) ?? null
}

/**
 * One editable field, claimable and lockable.
 *
 * `data-field` is what the editor reads off the DOM when focus arrives, to
 * claim the field -- the same way it already reads the block from
 * `data-block-id`. A fieldset because `disabled` on it disables every control
 * inside natively: the text field, the chips, the buttons of a select. No
 * input has to know it can be locked.
 */
export function LockField({
  blockId,
  field,
  children,
  className,
  noteClassName,
}: {
  blockId: string
  field: string
  children: ReactNode
  className?: string
  /** Where the "is typing" line sits, for a field laid out on a grid. */
  noteClassName?: string
}) {
  const t = useTranslations('agenda')
  const holder = useFieldHolder(blockId, field)

  return (
    <fieldset
      data-field={field}
      data-lock-block={blockId}
      disabled={holder !== null}
      className={cn(
        'm-0 min-w-0 border-0 p-0',
        holder && 'gw-peer rounded ring-2 ring-[var(--peer)]',
        className,
      )}
      style={holder ? hueStyle(holder.hue) : undefined}
    >
      {children}
      {holder && (
        <p
          className={cn('mt-0.5 text-[12px] font-medium text-[var(--peer)]', noteClassName)}
          role="status"
        >
          {t('fieldLocked', { name: describe(holder, t) })}
        </p>
      )}
    </fieldset>
  )
}
