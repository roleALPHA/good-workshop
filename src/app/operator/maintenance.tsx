'use client'

import { useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { MaintenanceRow } from '@/cloud/operator/console'
import { maintenanceAction } from './actions'

/**
 * Announcing planned maintenance, and taking an announcement back.
 *
 * On the console's front page rather than on a workspace: one window applies to
 * everybody, and AGB § 3.3 promises it is announced before it happens -- which
 * the database insists on, so a window that has already begun is refused here
 * as well as there.
 */
export function Maintenance({ windows }: { windows: MaintenanceRow[] }) {
  const t = useTranslations('operator.maintenance')
  const format = useFormatter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [note, setNote] = useState('')

  const run = (raw: Record<string, unknown>) =>
    start(async () => {
      const result = await maintenanceAction(raw)
      setError(result.ok ? null : t('error'))
      if (result.ok) {
        setStartsAt('')
        setEndsAt('')
        setNote('')
      }
    })

  const input =
    'min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[15px]'
  const button =
    'min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[15px] hover:bg-[var(--surface-raised)]'

  return (
    <section className="mt-8 rounded border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-[17px] font-medium">{t('title')}</h2>
      <p className="mt-1 text-[14px] text-[var(--fg-muted)]">{t('intro')}</p>

      {windows.length > 0 && (
        <ul className="mt-3 space-y-1 text-[15px]">
          {windows.map((window) => (
            <li key={window.id} className="flex flex-wrap items-center gap-2">
              <span className={window.cancelledAt ? 'line-through opacity-60' : undefined}>
                {format.dateTime(window.startsAt, { dateStyle: 'medium', timeStyle: 'short' })}
                {' – '}
                {format.dateTime(window.endsAt, { timeStyle: 'short' })}
                {window.note && ` · ${window.note}`}
              </span>
              {!window.cancelledAt && (
                <button
                  type="button"
                  className={button}
                  disabled={pending}
                  onClick={() => run({ kind: 'cancel_maintenance', windowId: window.id })}
                >
                  {t('cancel')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[14px]">
          {t('from')}
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={`${input} ml-2`}
          />
        </label>
        <label className="text-[14px]">
          {t('until')}
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className={`${input} ml-2`}
          />
        </label>
        <label className="flex-1 text-[14px]">
          {t('note')}
          <input
            type="text"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            className={`${input} ml-2 w-full`}
          />
        </label>
        <button
          type="button"
          className={button}
          disabled={pending || !startsAt || !endsAt}
          onClick={() =>
            run({
              kind: 'announce_maintenance',
              // The operator types local time; the window is stored as an
              // instant, because it is read by people in other time zones.
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              note,
            })
          }
        >
          {t('announce')}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </section>
  )
}
