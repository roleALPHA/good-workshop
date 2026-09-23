'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { getLocale } from 'next-intl/server'
import { adoptDesign, type AdoptResult } from '@/cloud/catalog/adopt'
import { roomEditor } from '@/server/collab/across-days'
import {
  currentActor,
  fail,
  firstIssue,
  toResult,
  type ActionResult,
} from '@/server/actions/context'
import type { Locale } from '@/i18n/config'

/**
 * Taking a design out of Discover and into this workspace.
 *
 * DELIBERATELY NOT THROUGH `action()`. That helper runs its body inside
 * `withTenant`, which is right for every other server action and wrong here:
 * adopting opens a collaboration room, and materialising a room takes the
 * workshop row's lock -- the same lock the surrounding transaction would still
 * be holding. The result is not an error but a wait, on a page somebody is
 * looking at. `adoptDesign` therefore opens and closes its own short
 * transaction and only then opens rooms, and this action must leave it room to.
 *
 * The rest of `action()`'s job is done here by hand: the actor, the schema,
 * and `toResult` so a domain error reaches the browser as a value in the
 * person's own language rather than as a stack trace across the RSC boundary.
 *
 * The rooms are opened with the person's own Cookie header, the way
 * src/server/actions/days.ts already does: the collaboration server checks it
 * exactly as it checks their browser, and nothing here holds a key of its own.
 */
const Adopt = z.union([
  z.object({
    designId: z.string().uuid(),
    kind: z.literal('new'),
    title: z.string().trim().max(300).optional(),
    folderId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    designId: z.string().uuid(),
    kind: z.literal('append'),
    workshopId: z.string().uuid(),
  }),
])

export async function adoptDesignAction(raw: unknown): Promise<ActionResult<AdoptResult>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = Adopt.safeParse(raw)
  if (!parsed.success) {
    const issue = firstIssue(parsed.error)
    return fail('invalid_input', issue.key, issue.params)
  }

  const [locale, headerList] = await Promise.all([getLocale(), headers()])
  const cookie = headerList.get('cookie') ?? ''

  try {
    const result = await adoptDesign(actor, (workshopId) => roomEditor({ workshopId, cookie }), {
      designId: parsed.data.designId,
      locale: locale as Locale,
      target:
        parsed.data.kind === 'new'
          ? {
              kind: 'new',
              title: parsed.data.title,
              folderId: parsed.data.folderId ?? null,
            }
          : { kind: 'append', workshopId: parsed.data.workshopId },
    })
    return { ok: true, data: result }
  } catch (error) {
    return toResult(error)
  }
}
