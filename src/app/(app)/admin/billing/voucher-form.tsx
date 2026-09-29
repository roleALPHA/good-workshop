'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ActiveVoucher } from '@/cloud/workspace/voucher'
import { redeemVoucherAction } from './actions'
import { Alert, field, useAction } from './billing-ui'

/**
 * A voucher code, entered where the payment method is.
 *
 * The card itself is typed on the payment provider's page, never here -- so
 * the code sits next to the button that leaves for it rather than inside it.
 * While a voucher runs there is nothing to enter: a workspace has one at a
 * time, and the field would only invite a refusal.
 */
export function VoucherForm({ voucher }: { voucher: ActiveVoucher | null }) {
  const t = useTranslations('admin.billing.voucher')
  const [code, setCode] = useState('')
  const { error, pending, act } = useAction()

  if (voucher) {
    const what =
      voucher.percent === 100
        ? t('free', { code: voucher.code })
        : t('active', { code: voucher.code, percent: voucher.percent })
    const until =
      voucher.monthsLeft === null ? t('forever') : t('monthsLeft', { count: voucher.monthsLeft })
    return (
      <p className="mt-4 border-t border-[var(--border)] pt-3 text-[14px]">
        {what} · {until}
      </p>
    )
  }

  return (
    <form
      className="mt-4 border-t border-[var(--border)] pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!code.trim()) return
        act(
          () => redeemVoucherAction(code),
          () => setCode(''),
        )
      }}
    >
      <label htmlFor="voucher-code" className="text-[14px]">
        {t('label')}
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="voucher-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${field} max-w-xs flex-1 uppercase`}
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          className="mt-1 min-h-11 rounded border border-[var(--border-strong)] px-4 text-[15px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
        >
          {t('redeem')}
        </button>
      </div>
      <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{t('hint')}</p>
      <Alert message={error} />
    </form>
  )
}
