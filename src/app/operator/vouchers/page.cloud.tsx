import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listVouchers } from '@/cloud/operator/vouchers'
import { currentOperator } from '@/cloud/operator/session'
import { RevokeVoucher, VoucherForm } from './voucher-form'

/** Every voucher, and a form for the next one. */
export default async function OperatorVouchers() {
  if (!(await currentOperator())) redirect('/operator/login' as never)
  const [t, format, vouchers] = await Promise.all([
    getTranslations('operator'),
    getFormatter(),
    listVouchers(operatorDb()),
  ])

  return (
    <div className="space-y-6">
      <div>
        <Link href={'/operator' as Route} className="text-[14px] underline underline-offset-2">
          ← {t('tenants.title')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{t('vouchers.title')}</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-[var(--fg-muted)]">{t('vouchers.intro')}</p>
      </div>

      <VoucherForm />

      {vouchers.length === 0 ? (
        <p className="text-[14px] text-[var(--fg-muted)]">{t('vouchers.none')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="text-[12px] text-[var(--fg-subtle)] uppercase">
              <tr>
                <th className="py-2">{t('vouchers.headCode')}</th>
                <th>{t('vouchers.headDiscount')}</th>
                <th>{t('vouchers.headDuration')}</th>
                <th>{t('vouchers.headUntil')}</th>
                <th>{t('vouchers.headRedeemed')}</th>
                <th>{t('vouchers.headStatus')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {vouchers.map((voucher) => (
                <tr
                  key={voucher.id}
                  className={voucher.status === 'active' ? undefined : 'opacity-60'}
                >
                  <td className="py-2">
                    <span className="font-mono">{voucher.code}</span>
                    {voucher.note && (
                      <div className="text-[12px] text-[var(--fg-muted)]">{voucher.note}</div>
                    )}
                  </td>
                  <td>{voucher.percent} %</td>
                  <td>
                    {voucher.durationMonths === null
                      ? t('vouchers.forever')
                      : t('vouchers.duration', { count: voucher.durationMonths })}
                  </td>
                  <td>
                    {voucher.redeemableUntil
                      ? format.dateTime(voucher.redeemableUntil, { dateStyle: 'medium' })
                      : t('vouchers.open')}
                  </td>
                  <td>
                    {voucher.maxRedemptions === null
                      ? voucher.redemptions
                      : t('vouchers.redeemedOf', {
                          count: voucher.redemptions,
                          max: voucher.maxRedemptions,
                        })}
                  </td>
                  <td>{t(`vouchers.status.${voucher.status}`)}</td>
                  <td>{!voucher.revokedAt && <RevokeVoucher voucherId={voucher.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
