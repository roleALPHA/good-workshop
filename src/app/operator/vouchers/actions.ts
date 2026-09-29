'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { operatorDb } from '@/cloud/operator/db'
import { currentOperator } from '@/cloud/operator/session'
import {
  createVoucher,
  NewVoucher,
  revokeVoucher,
  VoucherCodeInvalidError,
  VoucherCodeTakenError,
} from '@/cloud/operator/vouchers'

/**
 * Making and revoking vouchers from the console. The same funnel as the other
 * console actions: the operator from the session, a Zod parse, one app.op_*
 * function that validates again and writes the audit entry.
 */

export async function createVoucherAction(
  raw: unknown,
): Promise<
  | { ok: true; code: string }
  | { ok: false; error: 'input' | 'unauthenticated' | 'taken' | 'failed' }
> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const parsed = NewVoucher.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'input' }
  try {
    const made = await createVoucher(operatorDb(), operator.id, parsed.data)
    revalidatePath('/operator/vouchers')
    return { ok: true, code: made.code }
  } catch (error) {
    if (error instanceof VoucherCodeTakenError) return { ok: false, error: 'taken' }
    if (error instanceof VoucherCodeInvalidError) return { ok: false, error: 'input' }
    console.error('creating a voucher failed', { error })
    return { ok: false, error: 'failed' }
  }
}

export async function revokeVoucherAction(
  voucherId: string,
): Promise<{ ok: boolean; error?: 'input' | 'unauthenticated' | 'failed' }> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  if (!z.string().uuid().safeParse(voucherId).success) return { ok: false, error: 'input' }
  try {
    await revokeVoucher(operatorDb(), operator.id, voucherId)
  } catch (error) {
    console.error('revoking a voucher failed', { error })
    return { ok: false, error: 'failed' }
  }
  revalidatePath('/operator/vouchers')
  return { ok: true }
}
