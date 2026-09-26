import { asc } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { and, count, eq } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import { workshopDay } from '@/server/db/schema'
import { bumpContentVersion, NotFoundError, type WorkshopAccess } from '@/domain/agenda/access'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import { keyAtEnd, placeAfter, sortByPosition } from '@/domain/agenda/ordering'
import { DomainError } from '@/domain/errors'

/**
 * The days of a workshop, as rows.
 *
 * Adding and removing a day is a table operation rather than a document edit:
 * a day that does not exist yet has no room to write into, and a day being
 * removed takes its room state with it through the foreign keys. What a day
 * SAYS -- its title, start time and note -- is edited in its room, like every
 * other part of its content; see update_day in src/server/mcp/tools.ts.
 *
 * The date is the exception, and only because the materialiser does not carry
 * it back to the table: written here, it is written where it is read. The start
 * time of a NEW day is a second exception for the same reason it is a table
 * write at all -- there is no room yet to say it in.
 */

export class DayError extends DomainError {}

export type NewDay = { title: string; date?: string | null; startMinute?: number }

/** Appends a day behind the last one. */
export async function createDay(
  tx: Tx,
  access: WorkshopAccess,
  input: NewDay,
  expectedVersion?: bigint,
): Promise<{ dayId: string; contentVersion: bigint }> {
  // Before the insert, so a stale caller changes nothing at all.
  const contentVersion = await bumpContentVersion(tx, access, expectedVersion)

  const siblings = await tx
    .select({
      id: workshopDay.id,
      position: workshopDay.position,
      startTime: workshopDay.startTime,
    })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, access.workshopId))

  const ordered = sortByPosition(siblings)

  // A workshop that begins at half past eight begins at half past eight on
  // every day of it. Only the first day of all falls back to the column
  // default, which is the one place the hour is written down.
  const startTime =
    input.startMinute === undefined
      ? ordered[ordered.length - 1]?.startTime
      : toTime(input.startMinute)

  const dayId = uuidv7()
  await tx.insert(workshopDay).values({
    id: dayId,
    workshopId: access.workshopId,
    title: input.title,
    date: input.date ?? null,
    ...(startTime === undefined ? {} : { startTime }),
    position: keyAtEnd(ordered),
  })

  return { dayId, contentVersion }
}

/**
 * Removes a day with everything on it -- and never the last one.
 *
 * A workshop without a day is the dead end createWorkshop exists to avoid:
 * there is nothing to open, and the workshop page would have nowhere to send
 * anybody.
 *
 * Serialised with every other structural edit by the row lock the access check
 * took, so two calls each deleting "one of the two remaining days" cannot both
 * succeed.
 */
export async function deleteDay(
  tx: Tx,
  access: WorkshopAccess,
  dayId: string,
  expectedVersion?: bigint,
): Promise<bigint> {
  await assertDayInWorkshop(tx, access, dayId)

  const [row] = await tx
    .select({ days: count() })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, access.workshopId))
  if ((row?.days ?? 0) <= 1) throw new DayError('workshop.lastDay')

  const contentVersion = await bumpContentVersion(tx, access, expectedVersion)
  await tx
    .delete(workshopDay)
    .where(and(eq(workshopDay.id, dayId), eq(workshopDay.workshopId, access.workshopId)))

  return contentVersion
}

/**
 * Puts a day behind another one, or first when `afterId` is null.
 *
 * Anchor-based like every other move here: if a day was added or moved in the
 * meantime, this one still lands behind the neighbour that was meant.
 */
export async function moveDay(
  tx: Tx,
  access: WorkshopAccess,
  dayId: string,
  afterId: string | null,
  expectedVersion?: bigint,
): Promise<bigint> {
  const days = await tx
    .select({ id: workshopDay.id, position: workshopDay.position })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, access.workshopId))

  const known = new Set(days.map((day) => day.id))
  if (!known.has(dayId) || (afterId !== null && !known.has(afterId))) throw new NotFoundError()

  const contentVersion = await bumpContentVersion(tx, access, expectedVersion)
  if (afterId === dayId) return contentVersion

  const placement = placeAfter(
    days.filter((day) => day.id !== dayId),
    afterId,
  )
  const writes = placement.rebalance
    ? placement.rebalance.map((row) => ({ id: row.id || dayId, position: row.position }))
    : [{ id: dayId, position: placement.position }]

  for (const row of writes) {
    await tx
      .update(workshopDay)
      .set({ position: row.position })
      .where(and(eq(workshopDay.id, row.id), eq(workshopDay.workshopId, access.workshopId)))
  }

  return contentVersion
}

/** Sets or clears the calendar date of one day. */
export async function setDayDate(
  tx: Tx,
  access: WorkshopAccess,
  dayId: string,
  date: string | null,
): Promise<bigint> {
  const updated = await tx
    .update(workshopDay)
    .set({ date })
    .where(and(eq(workshopDay.id, dayId), eq(workshopDay.workshopId, access.workshopId)))
    .returning({ id: workshopDay.id })
  if (updated.length === 0) throw new NotFoundError()

  return bumpContentVersion(tx, access)
}

const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`

export async function firstDayOf(tx: Tx, workshopId: string): Promise<string | null> {
  const rows = await tx
    .select({ id: workshopDay.id })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, workshopId))
    .orderBy(asc(workshopDay.position))
    .limit(1)
  return rows[0]?.id ?? null
}

export async function listDays(tx: Tx, workshopId: string) {
  return tx
    .select({
      id: workshopDay.id,
      title: workshopDay.title,
      date: workshopDay.date,
      position: workshopDay.position,
    })
    .from(workshopDay)
    .where(eq(workshopDay.workshopId, workshopId))
    .orderBy(asc(workshopDay.position))
}
