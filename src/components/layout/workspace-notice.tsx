import Link from 'next/link'
import type { Route } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { AnnouncedChange, WorkspaceNotice } from '@/server/edition/types'

/** Whole days until an instant, never negative. A request-time value, not render state. */
function daysLeft(until: Date | null): number {
  return until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86_400_000)) : 0
}

/**
 * One line under the header when the workspace is not simply active: a trial,
 * read-only, paused, or waiting to be deleted. Everybody sees why they cannot
 * edit; admins get the way to change it.
 */
export async function WorkspaceNoticeBanner({
  notice,
  isAdmin,
}: {
  notice: WorkspaceNotice
  isAdmin: boolean
}) {
  const [t, format] = await Promise.all([getTranslations('nav.notice'), getFormatter()])
  const days = daysLeft(notice.trialEndsAt)
  const text =
    notice.state === 'trial'
      ? t('trial', { days })
      : notice.state === 'deleting'
        ? t('deleting', {
            date: notice.deleteAfter
              ? format.dateTime(notice.deleteAfter, { dateStyle: 'long' })
              : '',
          })
        : t(notice.state)
  const warn = notice.state !== 'trial'

  return (
    <div
      role={warn ? 'status' : undefined}
      className={`border-b border-[var(--border)] ${warn ? 'bg-[var(--warn-bg)] text-[var(--warn-fg)]' : 'bg-[var(--surface-raised)]'}`}
    >
      <p className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[14px]">
        <span>{text}</span>
        {isAdmin && notice.state !== 'paused' && (
          <Link
            href={'/admin/billing' as Route}
            className="font-medium underline underline-offset-2"
          >
            {t('toBilling')}
          </Link>
        )}
      </p>
    </div>
  )
}

/**
 * What is going to change, and from when.
 *
 * The terms promise six weeks before a price or a set of conditions applies,
 * and a mail alone is a promise kept in somebody's spam folder. The earliest
 * one only: two lines under the header are a header nobody reads.
 */
export async function AnnouncedChangeBanner({
  changes,
  isAdmin,
}: {
  changes: AnnouncedChange[]
  isAdmin: boolean
}) {
  const next = changes[0]
  if (!next) return null

  const [t, format] = await Promise.all([getTranslations('nav.notice'), getFormatter()])
  return (
    <div role="status" className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
      <p className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[14px]">
        <span>
          {t(next.kind === 'price' ? 'priceChange' : 'termsChange', {
            date: format.dateTime(next.effectiveFrom, { dateStyle: 'long' }),
          })}
        </span>
        {isAdmin && (
          <Link
            href={'/admin/billing' as Route}
            className="font-medium underline underline-offset-2"
          >
            {t('toBilling')}
          </Link>
        )}
      </p>
    </div>
  )
}
