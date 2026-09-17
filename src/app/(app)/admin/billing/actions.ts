'use server'

import { revalidatePath } from 'next/cache'
import { adapters, configured } from '@gw/billing-adapters'
import { authConfig } from '@/server/auth/config'
import { currentActor, fail, toResult, type ActionResult } from '@/server/actions/context'
import { checkVatId } from '@/cloud/tax/vies'
import {
  cancelWorkspaceDeletion,
  changePlan,
  requestWorkspaceDeletion,
  startPaymentSetup,
  updateBillingDetails,
} from '@/cloud/workspace/account'

/**
 * The billing page's writes. Only a cloud build has the page that calls them;
 * every one checks for a tenant admin in the domain, and the database refuses
 * anybody else on its own.
 */

async function run<T>(
  fn: (actor: NonNullable<Awaited<ReturnType<typeof currentActor>>>) => Promise<T>,
) {
  const actor = await currentActor()
  if (!actor) return fail<T>('unauthenticated', 'unauthenticated')
  try {
    const data = await fn(actor)
    revalidatePath('/', 'layout')
    return { ok: true, data } as ActionResult<T>
  } catch (error) {
    return toResult<T>(error)
  }
}

export async function changePlanAction(plan: string): Promise<ActionResult<null>> {
  return run(async (actor) => {
    await changePlan(actor, plan)
    return null
  })
}

export async function updateBillingDetailsAction(
  raw: Record<string, unknown>,
): Promise<ActionResult<null>> {
  return run(async (actor) => {
    await updateBillingDetails(actor, raw, (vatId) => checkVatId(vatId))
    return null
  })
}

export async function startPaymentSetupAction(): Promise<ActionResult<{ url: string } | null>> {
  if (!configured) return { ok: true, data: null }
  return run(async (actor) => ({
    url: await startPaymentSetup(
      actor,
      adapters,
      new URL('/admin/billing', authConfig.appUrl).toString(),
    ),
  }))
}

export async function requestWorkspaceDeletionAction(): Promise<ActionResult<string>> {
  return run(async (actor) => (await requestWorkspaceDeletion(actor)).toISOString())
}

export async function cancelWorkspaceDeletionAction(): Promise<ActionResult<null>> {
  return run(async (actor) => {
    await cancelWorkspaceDeletion(actor)
    return null
  })
}
