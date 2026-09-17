'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { deleteOwnAccount, setOwnName } from '@/domain/tenant/members'
import { destroySession } from '@/server/auth/session'
import { currentActor, fail, toResult, type ActionResult } from './context'

/**
 * Changing your own name.
 *
 * Takes no member id: whose name changes is decided by the session, so there is
 * no parameter anybody could point at a colleague.
 */
export async function updateOwnNameAction(raw: {
  firstName: string
  lastName: string
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const input = z
    .object({ firstName: z.string().max(1000), lastName: z.string().max(1000) })
    .safeParse(raw)
  if (!input.success) return fail('invalid_input', 'domain.person.firstNameRequired')

  try {
    await setOwnName(actor, input.data)
    // The header, the profile menu and presence all show it.
    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * Deleting your own account in this workspace, and signing out of it.
 *
 * The successor is chosen by the person leaving, for the same reason an admin
 * chooses one when removing somebody: nobody else knows who should get their
 * workshops. The domain refuses when one is needed and none is given.
 */
export async function deleteOwnAccountAction(raw: {
  successorId: string | null
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const input = z.object({ successorId: z.string().uuid().nullable() }).safeParse(raw)
  if (!input.success) return fail('invalid_input', 'domain.member.successorGone')

  try {
    await deleteOwnAccount(actor, input.data.successorId)
  } catch (error) {
    return toResult(error)
  }
  // The session outlives nothing it could act on -- the membership is gone and
  // the next request would fail anyway -- but it should not wait to find out.
  await destroySession()
  return { ok: true, data: null }
}
