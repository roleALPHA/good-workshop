'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * The two ways a day leaves the screen, and the one switch that decides what
 * goes with it.
 *
 * Both surfaces have understood `?notes=1` since they were built, and nothing
 * offered it: the only way to print your own notes was to type the parameter
 * into the address bar. So the feature existed and was unreachable, which is
 * the same as not existing.
 *
 * One checkbox for both, rather than two "with notes" variants of each button.
 * The question is not "which button do I press" but "who is this copy for" --
 * and that answer is the same whether it ends up on paper or in a mail.
 *
 * Off by default, and that is the load-bearing part: the common case is handing
 * the agenda to the group, and a default that leaks the facilitator's own notes
 * into that is a default nobody would have chosen deliberately.
 */
export function HandoverLinks({ workshopId, dayId }: { workshopId: string; dayId: string }) {
  const t = useTranslations('workshop')
  const [withNotes, setWithNotes] = useState(false)

  const suffix = withNotes ? '?notes=1' : ''
  const button =
    'inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)]'

  return (
    <>
      <label className="inline-flex items-center gap-1.5 text-[14px] text-[var(--fg-muted)] pointer-coarse:min-h-11">
        <input
          type="checkbox"
          checked={withNotes}
          onChange={(e) => setWithNotes(e.target.checked)}
          className="size-4"
        />
        {t('withNotes')}
      </label>

      <Link href={`/api/w/${workshopId}/d/${dayId}/export${suffix}`} className={button}>
        <Download aria-hidden className="size-4" />
        Markdown
      </Link>

      <Link href={`/print/w/${workshopId}/d/${dayId}${suffix}`} target="_blank" className={button}>
        <Printer aria-hidden className="size-4" />
        {t('print')}
      </Link>
    </>
  )
}
