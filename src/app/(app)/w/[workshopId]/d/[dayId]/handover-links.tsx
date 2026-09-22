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
  const [wholeWorkshop, setWholeWorkshop] = useState(false)

  const suffix = withNotes ? '?notes=1' : ''
  /**
   * Two scopes, two paths, one pair of buttons.
   *
   * The alternative was four buttons, and four buttons make the reader choose
   * twice: once for the scope and once for the format. The scope is the earlier
   * question -- what am I handing over -- so it is asked once, next to the one
   * about notes, and the buttons stay what they are.
   */
  const markdownHref = wholeWorkshop
    ? (`/api/w/${workshopId}/export${suffix}` as const)
    : (`/api/w/${workshopId}/d/${dayId}/export${suffix}` as const)
  const printHref = wholeWorkshop
    ? (`/print/w/${workshopId}${suffix}` as const)
    : (`/print/w/${workshopId}/d/${dayId}${suffix}` as const)
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

      <label className="inline-flex items-center gap-1.5 text-[14px] text-[var(--fg-muted)] pointer-coarse:min-h-11">
        <input
          type="checkbox"
          checked={wholeWorkshop}
          onChange={(e) => setWholeWorkshop(e.target.checked)}
          className="size-4"
        />
        {t('scopeWorkshop')}
      </label>

      <Link href={markdownHref} className={button}>
        <Download aria-hidden className="size-4" />
        Markdown
      </Link>

      <Link href={printHref} target="_blank" className={button}>
        <Printer aria-hidden className="size-4" />
        {t('print')}
      </Link>
    </>
  )
}
