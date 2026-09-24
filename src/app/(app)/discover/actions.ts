'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import {
  adoptDesign,
  adoptMethod,
  type AdoptMethodResult,
  type AdoptResult,
} from '@/cloud/catalog/adopt'
import { queryFromParams, type SearchParams } from '@/cloud/catalog/query'
import { entryView, type EntryView } from './entry-view'
import { listDays } from '@/domain/workshop/repo'
import { roomEditor } from '@/server/collab/across-days'
import {
  currentActor,
  fail,
  firstIssue,
  toResult,
  workshopAction,
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

export async function adoptDesignAction(
  raw: unknown,
): Promise<ActionResult<AdoptResult & { notes: string[] }>> {
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
    // Said here rather than in the panel: the counts decide which plural form
    // the sentence takes, and a client component cannot be handed the function
    // that chooses one.
    const t = await getTranslations('discover')
    const notes = [
      result.degraded > 0 && t('adoptDegraded', { count: result.degraded }),
      result.descsDropped > 0 && t('adoptDropped', { count: result.descsDropped }),
      result.daysFailed > 0 && t('adoptDaysFailed', { count: result.daysFailed }),
    ].filter((note): note is string => typeof note === 'string')
    return { ok: true, data: { ...result, notes } }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * One more page of the mixed list, for the island that scrolls.
 *
 * It takes the RAW address parameters and parses them here rather than taking
 * a parsed query from the browser. `queryFromParams` drops a facet value the
 * catalogue no longer offers, and that rule is the difference between a stale
 * bookmark answering the rest of the question and answering nothing at all --
 * it has to live in one place, on the server, where the live vocabulary is.
 *
 * No `action()` and no `withTenant`: the catalogue has no tenant_id, and one
 * library serves everybody. The session is still required -- Discover sits
 * behind the `(app)` gate -- which is what `currentActor` checks.
 */
export async function loadEntriesAction(
  params: SearchParams,
  cursor: string,
): Promise<ActionResult<{ items: EntryView[]; nextCursor: string | null }>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = Cursor.safeParse(cursor)
  if (!parsed.success) {
    const issue = firstIssue(parsed.error)
    return fail('invalid_input', issue.key, issue.params)
  }

  try {
    const locale = (await getLocale()) as Locale
    const [facets, t] = await Promise.all([
      catalog.listFacets(locale),
      getTranslations('discover'),
    ])
    const query = queryFromParams(params, locale, facets)
    const page = await catalog.listEntries({ ...query, cursor: parsed.data })
    // Worded here, not in the browser: a label function cannot cross into a
    // client component, and a page of entries would have to carry one.
    return {
      ok: true,
      data: { items: page.items.map((entry) => entryView(entry, t)), nextCursor: page.nextCursor },
    }
  } catch (error) {
    return toResult(error)
  }
}

const Cursor = z.string().trim().min(1).max(400)

/**
 * The days of one workshop, for the picker that says where a method lands.
 *
 * Each day arrives with the name the picker shows, unnamed ones already called
 * "Day 3" -- the fallback is a translation, and the panel is a client
 * component, which cannot be handed a function to make one.
 */
export async function loadWorkshopDays(
  workshopId: string,
): Promise<ActionResult<{ id: string; label: string }[]>> {
  const t = await getTranslations('discover')
  const result = await workshopAction(
    z.object({ workshopId: z.string().uuid() }),
    { workshopId },
    'workshop.read',
    (tx, _access, input) => listDays(tx, input.workshopId),
  )
  if (!result.ok) return result
  return {
    ok: true,
    data: result.data.map((day, index) => ({
      id: day.id,
      label: day.title?.trim() || t('dayHeading', { n: index + 1 }),
    })),
  }
}

/**
 * Taking one method out of Discover and into a day.
 *
 * The same two rules as `adoptDesignAction` above: no `action()`, because the
 * transaction would hold the lock the room needs, and the rooms opened with the
 * person's own Cookie header so that nothing here holds a key of its own.
 *
 * The block appears live in any tab that has the day open -- `editInRoom`
 * joins the room the browser is in -- and it appears without a name against
 * it, because no server action here sets a `presence`. That is the existing
 * behaviour of every room write outside the editor, and making this one the
 * exception would be a different change.
 */
const AdoptMethod = z.union([
  z.object({
    methodId: z.string().uuid(),
    kind: z.literal('day'),
    workshopId: z.string().uuid(),
    dayId: z.string().uuid(),
  }),
  z.object({
    methodId: z.string().uuid(),
    kind: z.literal('new'),
    title: z.string().trim().max(300).optional(),
    folderId: z.string().uuid().nullable().optional(),
  }),
])

export async function adoptMethodAction(
  raw: unknown,
): Promise<ActionResult<AdoptMethodResult>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = AdoptMethod.safeParse(raw)
  if (!parsed.success) {
    const issue = firstIssue(parsed.error)
    return fail('invalid_input', issue.key, issue.params)
  }

  const [locale, headerList] = await Promise.all([getLocale(), headers()])
  const cookie = headerList.get('cookie') ?? ''

  try {
    const result = await adoptMethod(actor, (workshopId) => roomEditor({ workshopId, cookie }), {
      methodId: parsed.data.methodId,
      locale: locale as Locale,
      target:
        parsed.data.kind === 'day'
          ? { kind: 'day', workshopId: parsed.data.workshopId, dayId: parsed.data.dayId }
          : {
              kind: 'new',
              title: parsed.data.title,
              folderId: parsed.data.folderId ?? null,
            },
    })
    return { ok: true, data: result }
  } catch (error) {
    return toResult(error)
  }
}
