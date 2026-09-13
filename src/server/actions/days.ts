'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import { createDay, moveDay } from '@/domain/workshop/days'
import { deleteDayKeepingParked, moveModuleToDay, roomEditor } from '@/server/collab/across-days'
import { currentActor, fail, toResult, workshopAction, type ActionResult } from './context'

/**
 * The days of a workshop, from the day page.
 *
 * Adding and reordering are table operations and run like every other action.
 * Deleting a day and bringing a parked block over from another day write into
 * collaboration rooms, and those two are shaped differently for a reason: a
 * room edit waits for the materialiser, which takes the workshop row lock --
 * so the access check runs in its own short transaction first, and the rooms
 * are opened after it has ended.
 *
 * The rooms are opened with the person's own cookie. The room authenticates it
 * exactly as it authenticates their browser; nothing here holds a key of its own.
 */

const Id = z.string().uuid()

export async function createDayAction(raw: {
  workshopId: string
  title: string
}): Promise<ActionResult<{ dayId: string }>> {
  const result = await workshopAction(
    z.object({ workshopId: Id, title: z.string().trim().min(1).max(300) }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => ({
      dayId: (await createDay(tx, access, { title: input.title })).dayId,
    }),
  )

  // The library shows how many days a workshop has.
  if (result.ok) revalidatePath('/library')
  return result
}

export async function moveDayAction(raw: {
  workshopId: string
  dayId: string
  afterId: string | null
}): Promise<ActionResult<{ contentVersion: string }>> {
  return workshopAction(
    z.object({ workshopId: Id, dayId: Id, afterId: Id.nullable() }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => ({
      contentVersion: (await moveDay(tx, access, input.dayId, input.afterId)).toString(),
    }),
  )
}

export async function deleteDayAction(raw: {
  workshopId: string
  dayId: string
}): Promise<ActionResult<{ remainingDayId: string; rescued: number }>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = z.object({ workshopId: Id, dayId: Id }).safeParse(raw)
  if (!parsed.success) return fail('invalid_input', 'invalid_input')

  try {
    const result = await deleteDayKeepingParked(
      actor,
      await personsRooms(parsed.data.workshopId),
      parsed.data,
    )
    revalidatePath('/library')
    return { ok: true, data: { remainingDayId: result.remainingDayId, rescued: result.rescued } }
  } catch (error) {
    return toResult(error)
  }
}

/** Takes a block off another day's shelf and into the schedule of the day on screen. */
export async function bringParkedBlockAction(raw: {
  workshopId: string
  moduleId: string
  fromDayId: string
  toDayId: string
}): Promise<ActionResult<{ moduleId: string }>> {
  const checked = await workshopAction(
    z.object({ workshopId: Id, moduleId: Id, fromDayId: Id, toDayId: Id }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => {
      await assertDayInWorkshop(tx, access, input.fromDayId)
      await assertDayInWorkshop(tx, access, input.toDayId)
      return input
    },
  )
  if (!checked.ok) return checked

  try {
    const moved = await moveModuleToDay(await personsRooms(checked.data.workshopId), {
      moduleId: checked.data.moduleId,
      fromDayId: checked.data.fromDayId,
      toDayId: checked.data.toDayId,
      parked: false,
    })
    return { ok: true, data: { moduleId: moved.moduleId } }
  } catch (error) {
    return toResult(error)
  }
}

async function personsRooms(workshopId: string) {
  return roomEditor({ workshopId, cookie: (await headers()).get('cookie') ?? '' })
}
