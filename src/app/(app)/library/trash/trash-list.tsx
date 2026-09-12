'use client'

import { useState, useTransition } from 'react'
import { purgeWorkshopAction, restoreWorkshopAction } from '@/server/actions/workshop'
import { useFormatter, useTranslations } from 'next-intl'

type Entry = { id: string; title: string; deletedAt: string | null }

/**
 * The bin, where deleting finally means it.
 *
 * This is the one screen in the application that asks before acting, and it
 * asks by name: everywhere else the worst case is a trip here, while from here
 * there is no way back. Typing the title is deliberately more effort than a
 * second click -- it is the difference between confirming and reading.
 */
export function TrashList({ initial }: { initial: Entry[] }) {
  const t = useTranslations('library.bin')
  const format = useFormatter()
  const [entries, setEntries] = useState(initial)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function restore(id: string) {
    setFailed(null)
    startTransition(async () => {
      const result = await restoreWorkshopAction({ workshopId: id })
      if (!result.ok) return setFailed(result.message)
      setEntries((current) => current.filter((row) => row.id !== id))
    })
  }

  function purge(entry: Entry) {
    setFailed(null)
    startTransition(async () => {
      const result = await purgeWorkshopAction({ workshopId: entry.id })
      if (!result.ok) return setFailed(result.message)
      setEntries((current) => current.filter((row) => row.id !== entry.id))
      setConfirming(null)
      setTyped('')
    })
  }

  if (entries.length === 0) {
    return (
      <div className="rounded border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
        <p className="font-medium">{t('empty')}</p>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('emptyHint')}</p>
      </div>
    )
  }

  return (
    <>
      {failed && (
        <p role="alert" className="mb-3 text-[14px] text-[var(--warn-fg)]">
          {failed}
        </p>
      )}

      <ul className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">
        {entries.map((entry) => (
          <li key={entry.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
              {entry.deletedAt && (
                <span className="shrink-0 text-[14px] text-[var(--fg-muted)]">
                  {t('discardedOn', { date: format.dateTime(new Date(entry.deletedAt), 'short') })}
                </span>
              )}
              <button
                type="button"
                onClick={() => restore(entry.id)}
                disabled={pending}
                className="shrink-0 rounded border border-[var(--border-strong)] px-2 py-1 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                {t('restore')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(confirming === entry.id ? null : entry.id)
                  setTyped('')
                }}
                disabled={pending}
                className="shrink-0 rounded px-2 py-1 text-[14px] text-[var(--warn-fg)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                {t('purge')}
              </button>
            </div>

            {confirming === entry.id && (
              <div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className="text-[14px]">
                  {t.rich('purgeWarning', {
                    title: entry.title,
                    b: (chunks) => <strong>{chunks}</strong>,
                  })}
                </p>
                <label
                  htmlFor={`confirm-${entry.id}`}
                  className="mt-2 block text-[13px] text-[var(--fg-muted)]"
                >
                  {t('purgeConfirmLabel')}
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <input
                    id={`confirm-${entry.id}`}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                    className="min-w-[14rem] flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[15px]"
                  />
                  {/* Not the same label as the button that opened this: two
                      identical "Endgültig löschen" a few pixels apart is a
                      thing to misclick, and the second one is the one that
                      cannot be taken back. */}
                  <button
                    type="button"
                    onClick={() => purge(entry)}
                    disabled={pending || typed.trim() !== entry.title}
                    className="rounded bg-[var(--danger-fg)] px-3 py-2 text-[15px] font-medium text-[var(--bg)] disabled:opacity-50"
                  >
                    {t('purgeConfirm')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
