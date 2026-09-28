'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ModuleTypeDto } from '@/domain/agenda/types'
import { formatDuration } from '@/features/agenda/duration'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'

/**
 * Pick a block type: a filter field and the types under it.
 *
 * Lifted out of the block picker so a strand column can offer the same choice
 * without a second copy. The alternative -- a button that silently creates
 * whichever type happens to come first -- is worse than it looks: there is no
 * way to change a block's type afterwards, so the arbitrary choice would be
 * permanent.
 */
export function BlockTypeList({
  types,
  onPick,
  onCancel,
  compact,
}: {
  types: ModuleTypeDto[]
  onPick: (typeKey: string) => void
  onCancel: () => void
  /** One column instead of two, for a strand that is 15rem wide. */
  compact?: boolean
}) {
  const t = useTranslations('agenda')
  const [filter, setFilter] = useState('')

  const matches = types.filter((type) =>
    type.name.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  const pick = (key: string) => {
    onPick(key)
    setFilter('')
  }

  return (
    <>
      <input
        autoFocus
        type="text"
        aria-label={t('searchType')}
        placeholder={t('filterPlaceholder')}
        className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px]"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && matches[0]) pick(matches[0].key)
        }}
      />

      <ul className={cn('mt-2 grid gap-1', !compact && 'sm:grid-cols-2')}>
        {matches.map((type) => (
          <li key={type.id}>
            <button
              type="button"
              onClick={() => pick(type.key)}
              className={cn(
                catClass(type.color),
                'flex w-full items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-left hover:border-[var(--cat-bar)]',
              )}
            >
              <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-[var(--cat-bar)]" />
              <span className="min-w-0 flex-1 truncate text-[15px]">{type.name}</span>
              <span className="tabular shrink-0 text-[13px] text-[var(--fg-subtle)]">
                {formatDuration(type.defaultDurationMinutes)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {matches.length === 0 && (
        <p className="mt-2 text-[14px] text-[var(--fg-muted)]">{t('noTypeMatches')}</p>
      )}
    </>
  )
}
