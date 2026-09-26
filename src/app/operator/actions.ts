'use server'

import { revalidatePath } from 'next/cache'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { saveCatalogFacet, saveCatalogEntry, setCatalogStatus } from '@/cloud/operator/catalog'
import { issueOperatorToken, revokeOperatorToken } from '@/cloud/operator/tokens'
import { disconnectOperatorClient } from '@/cloud/operator/oauth'
import { isOperatorScope } from '@/cloud/operator/scopes'
import { LOCALES } from '@/i18n/config'
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
): Promise<OperatorResult> {
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

// ── The Discover catalogue and the MCP credentials ──────────────────────────
//
// The same funnel as everything above: the operator from the session, a Zod
// parse, and then one app.op_* function. The function validates again and
// writes the audit entry; nothing here is the only thing standing between an
// argument and the database.

/** What every action here answers with. Named once, since there are now eight. */
export type OperatorResult = { ok: boolean; error?: 'input' | 'unauthenticated' | 'failed' }

/**
 * Per language, and deliberately not keyed on the locale enum: Zod would then
 * demand all four, and an entry translated into two is the normal case. The
 * database's own check constraint rejects a locale that is not one of ours.
 */
const Text = z.record(z.string(), z.record(z.string(), z.string()))

const EntryForm = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/u),
  durationMinutes: z.coerce.number().int().min(0).max(43_200),
  groupSize: z.string().trim().optional(),
  facets: z.array(z.string()).optional(),
  text: Text,
})

export async function saveEntryAction(raw: unknown): Promise<OperatorResult> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const input = EntryForm.safeParse(raw)
  if (!input.success) return { ok: false, error: 'input' }
  try {
    await saveCatalogEntry(operatorDb(), operator.id, input.data)
    revalidatePath('/operator/discover')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export async function setCatalogStatusAction(raw: unknown): Promise<OperatorResult> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const input = z
    .object({
      id: z.string().uuid(),
      locales: z.array(z.enum(LOCALES)).default([]),
      published: z.boolean(),
    })
    .safeParse(raw)
  if (!input.success) return { ok: false, error: 'input' }
  try {
    await setCatalogStatus(
      operatorDb(),
      operator.id,
      input.data.id,
      input.data.locales,
      input.data.published,
    )
    revalidatePath('/operator/discover')
    return { ok: true }
  } catch {
    // The one refusal worth its own answer: a language with no address cannot
    // be published, and "failed" would send somebody looking in the wrong place.
    return { ok: false, error: 'failed' }
  }
}

export async function saveFacetAction(raw: unknown): Promise<OperatorResult> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const input = z
    .object({
      group: z.string(),
      key: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/u),
      sortOrder: z.coerce.number().int().optional(),
      text: Text,
    })
    .safeParse(raw)
  if (!input.success) return { ok: false, error: 'input' }
  try {
    await saveCatalogFacet(operatorDb(), operator.id, input.data)
    revalidatePath('/operator/discover')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

/**
 * Issuing a credential, and the one place its secret exists.
 *
 * It is returned once and never stored: the row keeps the key and a hash. A
 * screen that could show it again would be a screen worth stealing.
 */
export async function issueTokenAction(raw: unknown): Promise<OperatorResult & { token?: string }> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const input = z
    .object({
      name: z.string().trim().min(1).max(80),
      scopes: z.array(z.string()).min(1),
      days: z.coerce.number().int().min(1).max(90),
    })
    .safeParse(raw)
  if (!input.success) return { ok: false, error: 'input' }

  const scopes = input.data.scopes.filter(isOperatorScope)
  if (scopes.length === 0) return { ok: false, error: 'input' }

  try {
    const { token } = await issueOperatorToken(operatorDb(), operator.id, {
      name: input.data.name,
      scopes,
      days: input.data.days,
    })
    revalidatePath('/operator/security')
    return { ok: true, token }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export async function revokeTokenAction(raw: unknown): Promise<OperatorResult> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const input = z.object({ tokenId: z.string().uuid() }).safeParse(raw)
  if (!input.success) return { ok: false, error: 'input' }
  try {
    await revokeOperatorToken(operatorDb(), operator.id, input.data.tokenId)
    revalidatePath('/operator/security')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

/**
 * Ends a client's connection: every token it holds, at once.
 *
 * Both kinds, in one statement in SQL. Revoking the access token alone would
 * leave a refresh token that mints another one within the minute, so this
 * would have been a pause rather than a disconnection.
 */
export async function disconnectClientAction(raw: unknown): Promise<OperatorResult> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'unauthenticated' }
  const input = z.object({ clientId: z.string().uuid() }).safeParse(raw)
  if (!input.success) return { ok: false, error: 'input' }
  try {
    await disconnectOperatorClient(operatorDb(), operator.id, input.data.clientId)
    revalidatePath('/operator/security')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
