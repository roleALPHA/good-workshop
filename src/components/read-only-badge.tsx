'use client'

import { Eye } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * Says why nothing here can be changed.
 *
 * A reader used to be handed the full editor: every control answered, every
 * change was thrown away on the next load. The editor is gone for them now, and
 * an agenda that simply stops responding needs a reason -- otherwise the answer
 * to "why can I not touch this" is a shrug.
 *
 * Deliberately quiet. Missing write access is a state, not a fault, so it wears
 * the same surface as the status pill in the library and none of the `--warn-*`
 * tokens. The eye is decoration; the word carries it, which is also what keeps
 * it out of the "state by colour alone" trap.
 */
export function ReadOnlyBadge() {
  const t = useTranslations('common')

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]">
      <Eye aria-hidden className="size-3.5" />
      {t('readOnly')}
    </span>
  )
}
