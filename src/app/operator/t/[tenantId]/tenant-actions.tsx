'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { operatorAction } from '../../actions'

const button =
  'min-h-11 rounded border border-[var(--border-strong)] px-3 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-50'
const input =
  'min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[15px]'

function useOperatorAction(tenantId: string) {
  const router = useRouter()
  const t = useTranslations('operator.actions')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = (raw: Record<string, unknown>) =>
    start(async () => {
      const result = await operatorAction(tenantId, raw)
      setError(result.ok ? null : t(`error.${result.error ?? 'failed'}`))
      if (result.ok) router.refresh()
    })
  return { error, pending, run }
}

/**
 * Every action that changes a workspace asks for a reason, which lands in the
 * audit log next to the operator's name.
 */
export function TenantActions({
  tenantId,
  state,
  blocked,
}: {
  tenantId: string
  state: string
  blocked: boolean
}) {
  const t = useTranslations('operator.actions')
  const { error, pending, run } = useOperatorAction(tenantId)
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('7')
  const hasReason = reason.trim().length >= 3

  return (
    <section className="rounded border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-[17px] font-medium">{t('title')}</h2>
      <label className="mt-3 block text-[14px]">
        {t('reason')}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={`${input} mt-1 w-full`}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {state === 'paused' ? (
          <button
            className={button}
            disabled={pending || !hasReason}
            onClick={() => run({ kind: 'unpause', reason })}
          >
            {t('unpause')}
          </button>
        ) : (
          <button
            className={button}
            disabled={pending || !hasReason || state === 'deleting'}
            onClick={() => run({ kind: 'pause', reason })}
          >
            {t('pause')}
          </button>
        )}
        <button
          className={`${button} text-[var(--danger-fg)]`}
          disabled={pending || !hasReason}
          onClick={() => run({ kind: blocked ? 'unblock' : 'block', reason })}
        >
          {blocked ? t('unblock') : t('block')}
        </button>
        {state === 'deleting' ? (
          <button
            className={button}
            disabled={pending}
            onClick={() => run({ kind: 'cancel_deletion' })}
          >
            {t('cancelDeletion')}
          </button>
        ) : (
          <button
            className={`${button} text-[var(--danger-fg)]`}
            disabled={pending || !hasReason}
            onClick={() => run({ kind: 'schedule_deletion', days, reason })}
          >
            {t('scheduleDeletion', { days })}
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-[14px]">
          {t('days')}
          <input
            type="number"
            min={0}
            max={90}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={`${input} ml-2 w-20`}
          />
        </label>
        <button
          className={button}
          disabled={pending || !['trial', 'read_only'].includes(state)}
          onClick={() => run({ kind: 'extend_trial', days })}
        >
          {t('extendTrial', { days })}
        </button>
        {/* Goodwill on the ACCESS, never on the invoice: the period stays open
            and billed, and writing one off belongs in the accounting system. */}
        <button
          className={button}
          disabled={pending || !['active', 'read_only', 'payment_blocked'].includes(state)}
          onClick={() => run({ kind: 'grant_grace', days, reason })}
        >
          {t('grantGrace', { days })}
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

TenantActions.Release = function Release({
  tenantId,
  periodId,
}: {
  tenantId: string
  periodId: string
}) {
  const t = useTranslations('operator.actions')
  const { pending, run } = useOperatorAction(tenantId)
  return (
    <span className="flex gap-1">
      <button
        className={button}
        disabled={pending}
        onClick={() => run({ kind: 'release_period', periodId, decision: 'bill' })}
      >
        {t('bill')}
      </button>
      <button
        className={button}
        disabled={pending}
        onClick={() => run({ kind: 'release_period', periodId, decision: 'void' })}
      >
        {t('void')}
      </button>
    </span>
  )
}
