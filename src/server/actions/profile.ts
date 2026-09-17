'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { setOwnName } from '@/domain/tenant/members'
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
