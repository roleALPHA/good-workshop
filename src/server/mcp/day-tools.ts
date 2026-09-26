import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { createDay, moveDay, setDayDate } from '@/domain/workshop/days'
import { listDays } from '@/domain/workshop/repo'
import { deleteDayKeepingParked, roomEditor } from '@/server/collab/across-days'
import { setDayFields } from '@/domain/collab/ops'
import { dayOf } from '@/domain/collab/doc'
import { formatTime } from '@/features/agenda/duration'
import { withTenant } from '@/server/db'
import { fail, guarded, ok } from './respond'
import { requireScope } from './auth'
import { Id, MCP_LOCALE, Version, asVersion, auditor, type Ctx } from './shared'

const Title = z.string().trim().min(1).max(300)
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
import { dayWriter, Minute, MODEL_PRESENCE } from './day-write'

/**
 * The days of a workshop: listing them, adding, reordering and removing one, and
 * the fields of a day itself -- its title, its date, its note, the hour it
 * starts.
 *
 * One file because a model asking about days asks about all of it, even though
 * the two halves take different routes. Listing, creating and reordering touch
 * no content, so they go straight to the repository; the fields of a day live in
 * the collaboration document and go through the room. Deleting straddles it:
 * the row and its room state go, but the parked blocks belong to the whole
 * workshop and move to a day that stays, which is a write into that day's room.
 *
 * Start times are never set here. They are computed from the day start and the
 * durations, and a block that must sit at a fixed clock time is pinned instead.
 * The blocks themselves are in ./day-block-tools.ts and ./day-agenda-tools.ts.
 */
export function registerDayTools(server: McpServer, ctx: Ctx): void {
  const { actor, authorization } = ctx
  const { inRoom, preflight, record } = dayWriter(ctx)
  const audit = auditor(actor, 'workshop')

  server.registerTool(
    'list_days',
    {
      title: 'List days',
      description: 'The days of a workshop, in order.',
      inputSchema: { workshopId: Id },
    },
    async ({ workshopId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        return withTenant(actor, async (tx) => {
          await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
          const days = (await listDays(tx, workshopId)).map((d) => ({
            id: d.id,
            title: d.title,
            date: d.date,
          }))
          return ok(
            days
              .map(
                (d, i) =>
                  `${i}. ${d.title || '(untitled)'}${d.date ? ` · ${d.date}` : ''} — id=${d.id}`,
              )
              .join('\n'),
            { days },
          )
        })
      }),
  )

  server.registerTool(
    'create_day',
    {
      title: 'Add a day',
      description:
        'Adds a day behind the last one. Fill it with apply_agenda; change it later with update_day.',
      inputSchema: {
        workshopId: Id,
        title: Title,
        date: IsoDate.optional(),
        startMinute: z
          .number()
          .int()
          .min(0)
          .max(1439)
          .optional()
          .describe(
            'Minutes since midnight, e.g. 540 = 09:00. Defaults to the start time of the last day, and to 09:00 for the first day of a workshop.',
          ),
        expectedVersion: Version,
      },
    },
    async ({ workshopId, title, date, startMinute, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
          const created = await createDay(
            tx,
            access,
            { title, date: date ?? null, startMinute },
            asVersion(expectedVersion),
          )
          await audit(tx, 'day.create', workshopId, { dayId: created.dayId, title })
          return ok(`Day added: ${title}\ndayId=${created.dayId}`, {
            dayId: created.dayId,
            contentVersion: created.contentVersion.toString(),
          })
        })
      }),
  )

  server.registerTool(
    'move_day',
    {
      title: 'Move a day',
      description:
        'Changes the order of the days. `afterId` is the day it should come after, or null to make it the first day.',
      inputSchema: { workshopId: Id, dayId: Id, afterId: Id.nullable(), expectedVersion: Version },
    },
    async ({ workshopId, dayId, afterId, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
          const contentVersion = await moveDay(
            tx,
            access,
            dayId,
            afterId,
            asVersion(expectedVersion),
          )
          await audit(tx, 'day.move', workshopId, { dayId, afterId })
          return ok('Day moved.', { contentVersion: contentVersion.toString() })
        })
      }),
  )

  server.registerTool(
    'delete_day',
    {
      title: 'Delete a day',
      description:
        'Deletes a day with its agenda, for good. Its parked blocks are kept: they move to the day before it ' +
        '(or after it, for the first day). The last remaining day of a workshop cannot be deleted.',
      inputSchema: { workshopId: Id, dayId: Id, expectedVersion: Version },
    },
    async ({ workshopId, dayId, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        const result = await deleteDayKeepingParked(
          actor,
          roomEditor({ workshopId, authorization, presence: MODEL_PRESENCE }),
          { workshopId, dayId, expectedVersion: asVersion(expectedVersion) },
        )

        await withTenant(actor, (tx) =>
          audit(tx, 'day.delete', workshopId, { dayId, rescued: result.rescued }),
        )
        return ok(
          result.rescued > 0
            ? `Day deleted. ${result.rescued} parked ${result.rescued === 1 ? 'block' : 'blocks'} moved to day ${result.remainingDayId}.`
            : 'Day deleted.',
          {
            contentVersion: result.contentVersion.toString(),
            remainingDayId: result.remainingDayId,
            rescued: result.rescued,
          },
        )
      }),
  )

  server.registerTool(
    'update_day',
    {
      title: 'Change a day',
      description:
        'Changes the title, date, start time or note of a day; fields you leave out stay as they are. ' +
        '`note` is free text about the day itself -- room, travel, what to bring; an empty string clears it. ' +
        '`date: null` removes the date.',
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        title: z.string().trim().min(1).max(300).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
          .nullable()
          .optional(),
        startMinute: Minute.optional().describe('Minutes since midnight, e.g. 540 = 09:00.'),
        note: z.string().max(10_000).optional(),
        expectedVersion: Version,
      },
    },
    async ({ workshopId, dayId, title, date, startMinute, note, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        if ([title, date, startMinute, note].every((value) => value === undefined)) {
          return fail('Nothing to change: pass at least one of title, date, startMinute, note.')
        }
        await preflight(workshopId, expectedVersion)

        // Title, start time and note through the room: the materialiser reads
        // them from the document, so a table write would be reverted. The date
        // goes into the document too, to keep it honest for whoever has the
        // day open -- but the materialiser does not carry it back, so the
        // table is written as well.
        let { contentVersion } = await inRoom(workshopId, dayId, (doc) => {
          const current = (dayOf(doc).get('desc') as Record<string, unknown> | undefined) ?? {}
          setDayFields(doc, {
            title,
            startMinute,
            date,
            desc: note === undefined ? undefined : { ...current, text: note },
          })
        })

        if (date !== undefined) {
          contentVersion = await withTenant(actor, async (tx) => {
            const access = await assertWorkshopAccess(
              tx,
              actor,
              workshopId,
              'workshop.content.write',
            )
            return setDayDate(tx, access, dayId, date)
          })
        }

        await record('day.update', workshopId, {
          dayId,
          fields: Object.entries({ title, date, startMinute, note })
            .filter(([, value]) => value !== undefined)
            .map(([key]) => key),
        })
        return ok('Day updated.', { contentVersion: contentVersion.toString() })
      }),
  )

  server.registerTool(
    'set_day_start',
    {
      title: 'Set the day start',
      description:
        'Sets a day start time in minutes since midnight (e.g. 540 = 09:00). update_day can do this too.',
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        startMinute: Minute,
      },
    },
    async ({ workshopId, dayId, startMinute }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        await preflight(workshopId, undefined)
        // Through the room like everything else. Writing start_time straight
        // to the table would have been reverted by the next materialisation,
        // which reads it from the document.
        const { contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          setDayFields(doc, { startMinute }),
        )

        await record('day.update', workshopId, { dayId, startMinute })
        return ok(`Day starts at ${formatTime(startMinute, MCP_LOCALE)}`, {
          contentVersion: contentVersion.toString(),
        })
      }),
  )
}
