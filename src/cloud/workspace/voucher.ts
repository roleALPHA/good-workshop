import { sql } from 'drizzle-orm'
import { withTenant, type Actor, type Tx } from '@/server/db'
import { assertTenantAdmin } from '@/domain/tenant/members'
import { DomainError, type DomainErrorKey } from '@/domain/errors'
import { normaliseVoucherCode } from '@/cloud/billing/voucher-code'

/**
 * A voucher, as a workspace admin redeems it next to the payment method.
 *
 * The workspace never sees the voucher table -- only its own redemption, with
 * the terms copied at the time. Every refusal is decided by
 * app.cloud_redeem_voucher (drizzle-cloud/sql/957_vouchers.sql), under a lock,
 * so the last use of a single-use code is spent once.
 */

export class VoucherError extends DomainError {}

export type ActiveVoucher = {
  code: string
  percent: number
  /** Null: it discounts every month for as long as the workspace is billed. */
  durationMonths: number | null
  /** Months it still discounts. Null when it has no end. */
  monthsLeft: number | null
}

/** What the database refuses with, and the sentence each becomes. */
const REFUSALS: Record<string, DomainErrorKey> = {
  voucher_unknown: 'voucher.unknown',
  voucher_expired: 'voucher.expired',
  voucher_exhausted: 'voucher.exhausted',
  voucher_already_redeemed: 'voucher.alreadyRedeemed',
  voucher_active: 'voucher.active',
}

function refusalOf(error: unknown): DomainErrorKey | null {
  for (let current = error; current instanceof Error; current = current.cause) {
    const pg = current as Error & { code?: string }
    if (pg.code === '22023' && pg.message in REFUSALS) return REFUSALS[pg.message]!
  }
  return null
}

export async function redeemVoucher(actor: Actor, typed: unknown): Promise<ActiveVoucher> {
  assertTenantAdmin(actor)
  // Something that cannot be a code is not asked about: the answer would be the
  // same, and the database has better things to do.
  const code = normaliseVoucherCode(typed)
  if (!code) throw new VoucherError('voucher.unknown')

  try {
    await withTenant(actor, (tx) => tx.execute(sql`select app.cloud_redeem_voucher(${code})`))
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) throw new VoucherError(refusal)
    throw error
  }
  const active = await withTenant(actor, readActiveVoucher)
  if (!active) throw new Error('a voucher just redeemed is not running')
  return active
}

/** The redemption that discounts the workspace now, if any. Reads through the tenant's policies. */
export async function readActiveVoucher(tx: Tx): Promise<ActiveVoucher | null> {
  const { rows } = (await tx.execute(
    sql`select r.code, r.percent, r.duration_months,
               (select count(*)::integer from billing_period p
                 where p.voucher_redemption_id = r.id) as months_used
          from voucher_redemption r
         order by r.redeemed_at desc`,
  )) as unknown as {
    rows: { code: string; percent: number; duration_months: number | null; months_used: number }[]
  }
  for (const row of rows) {
    const monthsLeft = row.duration_months === null ? null : row.duration_months - row.months_used
    if (monthsLeft !== null && monthsLeft <= 0) continue
    return { code: row.code, percent: row.percent, durationMonths: row.duration_months, monthsLeft }
  }
  return null
}
