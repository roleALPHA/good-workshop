'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SCOPES, createToken, listTokens, revokeToken, type TokenRow } from '@/domain/tenant/tokens'
import { action, type ActionResult } from './context'

export async function loadTokens(): Promise<ActionResult<TokenRow[]>> {
  return action(z.object({}), {}, (tx, actor) => listTokens(tx, actor))
}

/**
 * The secret crosses to the browser exactly once.
 *
 * Only its hash is stored, so there is no second chance to show it -- and that
 * is the point: a database dump of this table yields no working tokens.
 */
export async function createTokenAction(raw: {
  name: string
  scopes: string[]
}): Promise<ActionResult<{ token: string; row: TokenRow }>> {
  const result = await action(
    z.object({
      name: z.string().trim().min(1).max(80),
      scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length),
    }),
    raw,
    (tx, actor, input) => createToken(tx, actor, input),
  )

  if (result.ok) revalidatePath('/settings/tokens')
  return result
}

export async function revokeTokenAction(raw: { id: string }): Promise<ActionResult<null>> {
  const result = await action(
    z.object({ id: z.string().uuid() }),
    raw,
    async (tx, actor, input) => {
      await revokeToken(tx, actor, input.id)
      return null
    },
  )

  if (result.ok) revalidatePath('/settings/tokens')
  return result
}
