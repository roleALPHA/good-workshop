'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { authConfig } from '@/server/auth/config'
import { deletePasskey, listPasskeys } from '@/server/auth/passkey'
import { readSession } from '@/server/auth/session'
import { fail, type ActionResult } from './context'

/**
 * The passkeys on your own account.
 *
 * Deliberately not a tenant-admin screen: a passkey is a key to one person's
 * account, and enrolling or removing one for somebody else is not a power an
 * admin needs. Everything here reads the session and never takes an identity
 * from the caller.
 */

export type PasskeyView = {
  id: string
  nickname: string | null
  deviceType: string | null
  backedUp: boolean | null
  createdAt: string
  lastUsedAt: string | null
}

export type PasskeyPage = {
  passkeys: PasskeyView[]
  /** False without HTTPS, where the browser refuses WebAuthn outright. */
  available: boolean
  origin: string
}

export async function loadPasskeys(): Promise<ActionResult<PasskeyPage>> {
  const session = await readSession()
  if (!session) return fail('unauthenticated', 'unauthenticated')

  const rows = await listPasskeys(session.identityId)

  return {
    ok: true,
    data: {
      available: authConfig.passkeysAvailable,
      origin: authConfig.appUrl.origin,
      passkeys: rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        deviceType: row.deviceType,
        backedUp: row.backedUp,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      })),
    },
  }
}

export async function removePasskey(raw: { id: string }): Promise<ActionResult<null>> {
  const session = await readSession()
  if (!session) return fail('unauthenticated', 'unauthenticated')

  const parsed = z.object({ id: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return fail('invalid_input', 'passkey.unknown')

  // Scoped to the session's identity inside the statement itself -- see
  // deletePasskey. A caller cannot strip somebody else's device by id.
  const removed = await deletePasskey(session.identityId, parsed.data.id)
  if (!removed) return fail('not_found', 'passkey.notYours')

  revalidatePath('/settings/passkeys')
  return { ok: true, data: null }
}
