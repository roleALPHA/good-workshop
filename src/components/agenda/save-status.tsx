'use client'

import { useTranslations } from 'next-intl'
import type { DocumentStatus } from '@/features/agenda/document'

/**
 * Says nothing while things are fine.
 *
 * A permanent "saved" badge trains people to ignore the one place that would
 * tell them something went wrong. Only trouble is worth interrupting for.
 */
export function SaveStatus({ status }: { status: DocumentStatus }) {
  const t = useTranslations('agenda')
  if (status.kind === 'local' || status.kind === 'saved') return null

  // Nothing to say while a connection is healthy. Who else is here is named in
  // the presence bar, by name -- a second, vaguer count of the same people
  // underneath was both redundant and, as it happened, ungrammatical.
  if (status.kind === 'live') return null

  if (status.kind === 'connecting' || status.kind === 'saving') {
    return (
      <p className="px-4 py-1 text-[13px] text-[var(--fg-subtle)] md:px-2">
        {status.kind === 'connecting' ? t('connecting') : t('saving')}
      </p>
    )
  }

  return (
    <p
      role="alert"
      className="mx-4 my-2 rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[14px] text-[var(--warn-fg)] md:mx-2"
    >
      {status.kind === 'offline' ? t('offline') : status.message}
    </p>
  )
}
