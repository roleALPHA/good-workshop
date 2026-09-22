'use server'

import { revalidatePath } from 'next/cache'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { clientAddress } from '@/server/auth/client-address'
import { rateLimiter } from '@/server/auth/ratelimit'
import { operatorConsoleEnabled, operatorDb } from '@/cloud/operator/db'
import {
  addPasskey,
  addPasskeyOptions,
  completeEnrollment,
  enrollmentOptions,
  removePasskey,
  requestSignInLink,
  signInOptions,
  spendSignInLink,
  verifySignIn,
} from '@/cloud/operator/auth'
import { sendPlatformMail } from '@/server/auth/mail'
import { getTranslations } from 'next-intl/server'
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

/**
 * Asks for a sign-in link.
 *
 * Always the same answer. Whether the address belongs to an operator, whether
 * that operator is disabled, whether too many links are already out -- none of
 * it reaches the browser, because the console has no sign-up and every
 * distinguishable answer is a way to ask who the operators are.
 *
 * The mail goes out with the configuration from the environment alone. This
 * container runs as a role with no grant on any tenant table, so the usual
 * path -- read what an admin configured in the interface -- cannot work here:
 * it needs the application's database role. That is what made the first
 * version fail with "DATABASE_URL is not set" and drop every link.
 */
export async function operatorMailLink(email: unknown): Promise<void> {
  if (await limited()) return
  const address = z.string().trim().email().max(320).safeParse(email)
  if (!address.success) return

  const issued = await requestSignInLink(operatorDb(), address.data)
  if (!issued) return

  const t = await getTranslations('operator.signIn')
  const link = new URL(
    `/operator/login/${issued.token}`,
    process.env.GW_OPERATOR_URL ?? process.env.GW_APP_URL ?? 'http://localhost:3002',
  ).toString()

  await sendPlatformMail({
    to: issued.operator.email,
    subject: t('mailSubject'),
    text: t('mailBody', { link }),
  })
}

/**
 * Spends a sign-in link and starts the session.
 *
 * A Server Action rather than a GET or a POST route, for the Origin check Next
 * does on every action: without one, any site could submit a form that signs a
 * visitor into an account of the attacker's choosing. And because it is not a
 * GET, no mail scanner reaches it -- which is the reason the link stopped
 * working for a Microsoft 365 mailbox in the first place.
 */
export async function operatorConfirmSignIn(token: string): Promise<boolean> {
  if (await limited()) return false
  const operator = await spendSignInLink(operatorDb(), token)
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

/**
 * The passkeys of whoever is signed in -- their own, never anybody else's.
 *
 * Each one re-reads the session rather than trusting an operator id from the
 * browser: an action can be called directly, and an id in its arguments is an
 * id the caller chooses.
 */
export async function operatorPasskeyOptions() {
  const operator = await currentOperator()
  if (!operator || (await limited())) return null
  return addPasskeyOptions(operatorDb(), operator.id)
}

export async function operatorAddPasskey(response: RegistrationResponseJSON): Promise<boolean> {
  const operator = await currentOperator()
  if (!operator || (await limited())) return false
  const added = await addPasskey(operatorDb(), operator.id, response)
  if (added) revalidatePath('/operator/security')
  return added
}

export async function operatorRemovePasskey(credentialId: unknown): Promise<boolean> {
  const operator = await currentOperator()
  if (!operator || (await limited())) return false
  const id = z.string().trim().min(1).max(1024).safeParse(credentialId)
  if (!id.success) return false
  const removed = await removePasskey(operatorDb(), operator.id, id.data)
  if (removed) revalidatePath('/operator/security')
  return removed
}

export async function operatorSignOut(): Promise<void> {
  if (operatorConsoleEnabled()) await endOperatorSession()
}

const Reason = z.string().trim().min(3).max(500)
const ActionInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['pause', 'unpause', 'block', 'unblock']), reason: Reason }),
  z.object({ kind: z.literal('extend_trial'), days: z.coerce.number().int().min(1).max(90) }),
  z.object({
    kind: z.literal('grant_grace'),
    days: z.coerce.number().int().min(1).max(90),
    reason: Reason,
  }),
  z.object({
    kind: z.literal('announce_terms'),
    document: z.enum(['impressum', 'agb', 'datenschutz', 'avv']),
    version: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveFrom: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({
    kind: z.literal('schedule_deletion'),
    days: z.coerce.number().int().min(0).max(90),
    reason: Reason,
  }),
  z.object({ kind: z.literal('cancel_deletion') }),
  z.object({
    kind: z.literal('announce_maintenance'),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(500),
  }),
  z.object({ kind: z.literal('cancel_maintenance'), windowId: z.string().uuid() }),
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

/**
 * The actions that are not about one workspace.
 *
 * `operatorAction` insists on a tenant, which is right for everything that
 * happens to a workspace and wrong for a maintenance window: one window applies
 * to everybody, and inventing a tenant to pass would be inventing a subject.
 */
const WholeInstallation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('announce_maintenance'),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(500),
  }),
  z.object({ kind: z.literal('cancel_maintenance'), windowId: z.string().uuid() }),
])

export async function maintenanceAction(
  raw: Record<string, unknown>,
): Promise<{ ok: boolean; error?: 'input' | 'unauthenticated' | 'failed' }> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const parsed = WholeInstallation.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'input' }
  try {
    await applyOperatorAction(operatorDb(), operator.id, null, parsed.data as OperatorAction)
  } catch (error) {
    console.error('maintenance action failed', { error, kind: parsed.data.kind })
    return { ok: false, error: 'failed' }
  }
  revalidatePath('/operator')
  return { ok: true }
}
