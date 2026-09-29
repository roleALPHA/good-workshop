'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createVoucherAction, revokeVoucherAction } from './actions'

const input =
  'min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[15px]'
const button =
  'min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[15px] hover:bg-[var(--surface-raised)] disabled:opacity-60'

type Uses = 'once' | 'limited' | 'unlimited'

/**
 * A new voucher. Every limit is optional, and empty means none: no end date,
 * no end to the months, any number of workspaces. "Once" is the single-use
 * code, and the default, because a code that works for everybody is the one
 * that ends up on a forum.
 */
export function VoucherForm() {
  const t = useTranslations('operator.vouchers')
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [code, setCode] = useState('')
  const [percent, setPercent] = useState('')
  const [months, setMonths] = useState('')
  const [until, setUntil] = useState('')
  const [uses, setUses] = useState<Uses>('once')
  const [max, setMax] = useState('')
  const [note, setNote] = useState('')

  const number = (value: string) => (value.trim() === '' ? null : Number(value))

  const submit = () =>
    start(async () => {
      const result = await createVoucherAction({
        code: code.trim() || null,
        percent: Number(percent),
        durationMonths: number(months),
        // The operator types a local date; it counts to the end of that day.
        redeemableUntil: until ? new Date(`${until}T23:59:59`).toISOString() : null,
        maxRedemptions: uses === 'once' ? 1 : uses === 'limited' ? number(max) : null,
        note: note.trim(),
      })
      if (!result.ok) {
        setMessage({ error: true, text: result.error === 'taken' ? t('taken') : t('error') })
        return
      }
      setMessage({ error: false, text: t('created', { code: result.code }) })
      setCode('')
      setNote('')
    })

  return (
    <form
      className="rounded border border-[var(--border)] bg-[var(--surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[14px]">
          {t('code')}
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={32}
            autoComplete="off"
            className={`${input} mt-1 block w-full font-mono uppercase`}
          />
          <span className="text-[12px] text-[var(--fg-muted)]">{t('codeHint')}</span>
        </label>
        <label className="text-[14px]">
          {t('percent')}
          <input
            type="number"
            min={1}
            max={100}
            required
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            className={`${input} mt-1 block w-full`}
          />
        </label>
        <label className="text-[14px]">
          {t('months')}
          <input
            type="number"
            min={1}
            max={120}
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            className={`${input} mt-1 block w-full`}
          />
          <span className="text-[12px] text-[var(--fg-muted)]">{t('monthsHint')}</span>
        </label>
        <label className="text-[14px]">
          {t('until')}
          <input
            type="date"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            className={`${input} mt-1 block w-full`}
          />
          <span className="text-[12px] text-[var(--fg-muted)]">{t('untilHint')}</span>
        </label>
        <fieldset className="text-[14px]">
          <legend>{t('uses')}</legend>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            {(['once', 'limited', 'unlimited'] as const).map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="uses"
                  value={value}
                  checked={uses === value}
                  onChange={() => setUses(value)}
                />
                {t(
                  value === 'once'
                    ? 'usesOnce'
                    : value === 'limited'
                      ? 'usesLimited'
                      : 'usesUnlimited',
                )}
              </label>
            ))}
            {uses === 'limited' && (
              <input
                type="number"
                min={2}
                required
                aria-label={t('maxRedemptions')}
                value={max}
                onChange={(event) => setMax(event.target.value)}
                className={`${input} w-24`}
              />
            )}
          </div>
        </fieldset>
        <label className="text-[14px]">
          {t('note')}
          <input
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            className={`${input} mt-1 block w-full`}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className={button} disabled={pending || !percent}>
          {t('create')}
        </button>
        {message && (
          <p
            role={message.error ? 'alert' : 'status'}
            className={`text-[14px] ${message.error ? 'text-[var(--danger-fg)]' : ''}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  )
}

export function RevokeVoucher({ voucherId }: { voucherId: string }) {
  const t = useTranslations('operator.vouchers')
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  return (
    <>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(!(await revokeVoucherAction(voucherId)).ok)
          })
        }
      >
        {t('revoke')}
      </button>
      {failed && (
        <span role="alert" className="ml-2 text-[13px] text-[var(--danger-fg)]">
          {t('error')}
        </span>
      )}
    </>
  )
}
