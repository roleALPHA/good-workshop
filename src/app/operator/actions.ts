'use server'

import { revalidatePath } from 'next/cache'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { clientAddress } from '@/server/auth/client-address'
import { rateLimiter } from '@/server/auth/ratelimit'
import { operatorConsoleEnabled, operatorDb } from '@/cloud/operator/db'
import {
  completeEnrollment,
  enrollmentOptions,
  signInOptions,
  verifySignIn,
} from '@/cloud/operator/auth'
import { applyOperatorAction, type OperatorAction } from '@/cloud/operator/console'
import { currentOperator, endOperatorSession, startOperatorSession } from '@/cloud/operator/session'

/**
 * The console's server actions. Each one checks that this process runs the
 * console and, except for signing in, that an operator is signed in -- the
 * layout's check does not protect an action, which can be called directly.
 */

const attempts = rateLimiter({ limit: 20, windowMs: 10 * 60_000 })

async function limited() {
  return !operatorConsoleEnabled() || !attempts.take(clientAddress(await headers()))
}

export async function operatorSignInOptions() {
  if (await limited()) return null
  return signInOptions(operatorDb())
}

export async function operatorSignIn(response: AuthenticationResponseJSON): Promise<boolean> {
  if (await limited()) return false
  const operator = await verifySignIn(operatorDb(), response)
  if (!operator) return false
  await startOperatorSession(operator.id)
  return true
}

export async function operatorEnrollmentOptions(token: string) {
  if (await limited()) return null
  return enrollmentOptions(operatorDb(), token)
}

export async function operatorEnroll(
  token: string,
  response: RegistrationResponseJSON,
): Promise<boolean> {
  if (await limited()) return false
  const operator = await completeEnrollment(operatorDb(), token, response)
  if (!operator) return false
  await startOperatorSession(operator.id)
  return true
}

export async function operatorSignOut(): Promise<void> {
  if (operatorConsoleEnabled()) await endOperatorSession()
}

const Reason = z.string().trim().min(3).max(500)
const ActionInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['pause', 'unpause', 'block', 'unblock']), reason: Reason }),
  z.object({ kind: z.literal('extend_trial'), days: z.coerce.number().int().min(1).max(90) }),
  z.object({
    kind: z.literal('schedule_deletion'),
    days: z.coerce.number().int().min(0).max(90),
    reason: Reason,
  }),
  z.object({ kind: z.literal('cancel_deletion') }),
  z.object({
    kind: z.literal('release_period'),
    periodId: z.string().uuid(),
    decision: z.enum(['bill', 'void']),
  }),
])

export async function operatorAction(
  tenantId: string,
  raw: Record<string, unknown>,
): Promise<{ ok: boolean; error?: 'input' | 'unauthenticated' | 'failed' }> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const parsed = ActionInput.safeParse(raw)
  if (!parsed.success || !z.string().uuid().safeParse(tenantId).success) {
    return { ok: false, error: 'input' }
  }
  try {
    await applyOperatorAction(operatorDb(), operator.id, tenantId, parsed.data as OperatorAction)
  } catch (error) {
    console.error('operator action failed', { error, tenantId, kind: parsed.data.kind })
    return { ok: false, error: 'failed' }
  }
  revalidatePath(`/operator/t/${tenantId}`)
  return { ok: true }
}
