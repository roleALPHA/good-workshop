import type pg from 'pg'
import { z } from 'zod'
import { generateVoucherCode, normaliseVoucherCode } from '@/cloud/billing/voucher-code'

/**
 * Vouchers, as the console and the operator MCP make and end them.
 *
 * Each a call to one app.op_* function (drizzle-cloud/sql/957_vouchers.sql),
 * which validates again and writes the audit entry. Not part of
 * `applyOperatorAction`: making a voucher answers with the code, and a code the
 * console made up is useless until somebody has read it.
 */

type Db = Pick<pg.Pool, 'query'>

export type VoucherStatus = 'active' | 'revoked' | 'expired' | 'exhausted'

export type VoucherRow = {
  id: string
  code: string
  percent: number
  /** Null: it discounts every billed month, for good. */
  durationMonths: number | null
  /** Null: redeemable until revoked. */
  redeemableUntil: Date | null
  /** Null: any number of workspaces; 1 is a single-use code. */
  maxRedemptions: number | null
  note: string
  createdAt: Date
  createdBy: string | null
  revokedAt: Date | null
  redemptions: number
  status: VoucherStatus
}

/** What making a voucher takes, from the console form and from MCP alike. */
export const NewVoucher = z.object({
  /** Empty: the console makes one up. */
  code: z.string().max(64).nullish(),
  percent: z.number().int().min(1).max(100),
  durationMonths: z.number().int().min(1).max(120).nullable(),
  redeemableUntil: z.string().datetime({ offset: true }).nullable(),
  maxRedemptions: z.number().int().min(1).nullable(),
  note: z.string().max(500),
})
export type NewVoucher = z.infer<typeof NewVoucher>

export class VoucherCodeTakenError extends Error {
  constructor(readonly code: string) {
    super(`voucher code ${code} exists`)
    this.name = 'VoucherCodeTakenError'
  }
}

export class VoucherCodeInvalidError extends Error {
  constructor() {
    super('a voucher code is 4 to 32 letters, digits or dashes')
    this.name = 'VoucherCodeInvalidError'
  }
}

function statusOf(row: Omit<VoucherRow, 'status'>, now: Date): VoucherStatus {
  if (row.revokedAt) return 'revoked'
  if (row.redeemableUntil && row.redeemableUntil <= now) return 'expired'
  if (row.maxRedemptions !== null && row.redemptions >= row.maxRedemptions) return 'exhausted'
  return 'active'
}

/** Every voucher, the ones still redeemable first. */
export async function listVouchers(db: Db, now = new Date()): Promise<VoucherRow[]> {
  const { rows } = await db.query('select * from app.op_vouchers()')
  return rows.map((row) => {
    const voucher = {
      id: row.id,
      code: row.code,
      percent: row.percent,
      durationMonths: row.duration_months,
      redeemableUntil: row.redeemable_until,
      maxRedemptions: row.max_redemptions,
      note: row.note,
      createdAt: row.created_at,
      createdBy: row.created_by,
      revokedAt: row.revoked_at,
      redemptions: row.redemptions,
    }
    return { ...voucher, status: statusOf(voucher, now) }
  })
}

export async function createVoucher(
  db: Db,
  operatorId: string,
  input: NewVoucher,
): Promise<{ id: string; code: string }> {
  const chosen = input.code?.trim() ? normaliseVoucherCode(input.code) : null
  if (input.code?.trim() && !chosen) throw new VoucherCodeInvalidError()

  // A made-up code that happens to exist is drawn again; a chosen one is the
  // operator's to change.
  for (let attempt = 0; ; attempt++) {
    const code = chosen ?? generateVoucherCode()
    try {
      const { rows } = await db.query(
        'select app.op_create_voucher($1, $2, $3, $4, $5, $6, $7) as id',
        [
          operatorId,
          code,
          input.percent,
          input.durationMonths,
          input.redeemableUntil,
          input.maxRedemptions,
          input.note,
        ],
      )
      return { id: rows[0].id, code }
    } catch (error) {
      const taken = (error as { code?: string }).code === '23505'
      if (!taken) throw error
      if (chosen || attempt >= 2) throw new VoucherCodeTakenError(code)
    }
  }
}

/** Stops new redemptions. The ones already made keep their discount. */
export async function revokeVoucher(db: Db, operatorId: string, voucherId: string): Promise<void> {
  await db.query('select app.op_revoke_voucher($1, $2)', [operatorId, voucherId])
}

export type RedemptionRow = {
  code: string
  percent: number
  durationMonths: number | null
  redeemedAt: Date
  monthsUsed: number
  running: boolean
}

/** What one workspace has redeemed, newest first. */
export async function tenantRedemptions(db: Db, tenantId: string): Promise<RedemptionRow[]> {
  const { rows } = await db.query('select * from app.op_voucher_redemptions($1)', [tenantId])
  return rows.map((row) => ({
    code: row.code,
    percent: row.percent,
    durationMonths: row.duration_months,
    redeemedAt: row.redeemed_at,
    monthsUsed: row.months_used,
    running: row.running,
  }))
}
