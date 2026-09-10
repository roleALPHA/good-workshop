import { z } from 'zod'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertWorkshopAccess, VersionConflictError } from '@/domain/agenda/access'
import { addModule, applyAgenda, deleteModule, loadDay, moveModule } from '@/domain/agenda/repo'
import { createWorkshop, firstDayOf, listDays } from '@/domain/workshop/repo'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { renderDayMarkdown } from '@/server/export/markdown'
import { withTenant } from '@/server/db'
import { auditEvent, moduleType, workshop, workshopDay } from '@/server/db/schema'
import { requireScope, type PatActor } from './auth'

/**
 * The tools an LLM client gets.
 *
 * Four conventions run through all of them, and each exists because of a
 * specific way models fail:
 *
 *  - Ordinals, never fractional keys. A model cannot reason about `a0V` and
 *    will cheerfully invent one.
 *  - `expectedVersion` on every mutation. Without it, a model working from a
 *    five-minute-old read silently clobbers live edits -- reported afterwards
 *    as "the AI deleted my workshop".
 *  - Errors name the field, the constraint and the allowed values, so the next
 *    call can be right rather than a second guess.
 *  - Every mutation writes an audit event. Non-negotiable for a tool that lets
 *    a model write to somebody's data.
 */

type Ctx = { actor: PatActor }

const ok = (text: string, structured?: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text }],
  ...(structured ? { structuredContent: structured } : {}),
})

const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true })

export function registerTools(server: McpServer, ctx: Ctx): void {
  const { actor } = ctx

  const audit = (
    tx: Parameters<Parameters<typeof withTenant>[1]>[0],
    action: string,
    entityId: string | null,
    data: Record<string, unknown> = {},
  ) =>
    tx.insert(auditEvent).values({
      actorMemberId: actor.memberId,
      source: 'mcp',
      tokenId: actor.patId,
      entityType: 'workshop',
      entityId,
      action,
      data,
    })

  // ── Read ────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_module_types',
    {
      title: 'Modultypen auflisten',
      description:
        'Alle verfügbaren Blocktypen mit ihren Feldschemata. Vor dem Anlegen von Blöcken aufrufen: die Schemata sagen, welche Angaben ein Typ akzeptiert.',
      inputSchema: {},
    },
    async () => {
      requireScope(actor, 'module_types:read')
      const types = await withTenant(actor, (tx) =>
        tx.select().from(moduleType).where(eq(moduleType.isActive, true)),
      )

      return ok(
        types
          .map((t) => `${t.key} — ${t.name} (${formatDuration(t.defaultDurationMinutes)})`)
          .join('\n'),
        {
          moduleTypes: types.map((t) => ({
            key: t.key,
            name: t.name,
            category: t.category,
            defaultDurationMinutes: t.defaultDurationMinutes,
            countsAsContent: t.countsAsContent,
            jsonSchema: t.jsonSchema,
          })),
        },
      )
    },
  )

  server.registerTool(
    'list_workshops',
    {
      title: 'Workshops auflisten',
      description: 'Die Workshops, auf die dieses Token Zugriff hat.',
      inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
    },
    async ({ limit }) => {
      requireScope(actor, 'workshops:read')
      const rows = await withTenant(actor, (tx) =>
        tx
          .select({
            id: workshop.id,
            title: workshop.title,
            status: workshop.status,
            updatedAt: workshop.updatedAt,
          })
          .from(workshop)
          .where(isNull(workshop.deletedAt))
          .orderBy(desc(workshop.updatedAt))
          .limit(limit),
      )

      if (rows.length === 0) return ok('Noch keine Workshops.', { workshops: [] })
      return ok(rows.map((w) => `${w.id}  ${w.title} (${w.status})`).join('\n'), {
        workshops: rows.map((w) => ({ ...w, updatedAt: w.updatedAt.toISOString() })),
      })
    },
  )

  server.registerTool(
    'get_workshop',
    {
      title: 'Workshop lesen',
      description:
        'Der Ablauf eines Workshoptags mit berechneten Startzeiten. `view: markdown` liefert den fertigen Export.',
      inputSchema: {
        workshopId: z.string().uuid(),
        dayId: z.string().uuid().optional(),
        view: z.enum(['outline', 'markdown']).default('outline'),
      },
    },
    async ({ workshopId, dayId, view }) => {
      requireScope(actor, 'workshops:read')

      return withTenant(actor, async (tx) => {
        const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
        const resolvedDayId = dayId ?? (await firstDayOf(tx, workshopId))
        if (!resolvedDayId) return fail('Dieser Workshop hat noch keinen Tag.')

        const { doc, contentVersion } = await loadDay(tx, access, resolvedDayId)
        const meta = await tx
          .select({ title: workshop.title })
          .from(workshop)
          .where(eq(workshop.id, workshopId))
          .limit(1)
        const title = meta[0]?.title ?? 'Workshop'

        if (view === 'markdown') {
          return ok(renderDayMarkdown({ title }, doc), {
            contentVersion: contentVersion.toString(),
          })
        }

        const rows = flattenDay(doc)
        const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))

        const lines = rows.map((row, index) => {
          const entry = schedule.entries.get(row.id)
          const time = entry ? formatTime(entry.startMinute) : '--:--'
          if (row.kind === 'cluster') return `${index}. [${time}] ## ${row.cluster.title}`
          if (row.kind !== 'module') return `${index}. [${time}] (Puffer)`
          const type = doc.moduleTypes[row.module.moduleTypeId]
          return `${index}. [${time}] ${row.depth === 1 ? '  ' : ''}${row.module.title} · ${formatDuration(row.module.durationMinutes)} · ${type?.key ?? '?'} · id=${row.id}`
        })

        return ok(
          [
            `${title} — ${doc.title || 'Tag'}`,
            `contentVersion: ${contentVersion} (bei Änderungen mitschicken)`,
            '',
            ...lines,
          ].join('\n'),
          { contentVersion: contentVersion.toString(), dayId: resolvedDayId },
        )
      })
    },
  )

  server.registerTool(
    'list_days',
    {
      title: 'Tage auflisten',
      description: 'Die Tage eines Workshops.',
      inputSchema: { workshopId: z.string().uuid() },
    },
    async ({ workshopId }) => {
      requireScope(actor, 'workshops:read')
      return withTenant(actor, async (tx) => {
        await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
        const days = await listDays(tx, workshopId)
        return ok(days.map((d, i) => `${i}. ${d.title || 'Tag'} — id=${d.id}`).join('\n'), { days })
      })
    },
  )

  // ── Write ───────────────────────────────────────────────────────────────

  server.registerTool(
    'create_workshop',
    {
      title: 'Workshop anlegen',
      description: 'Legt einen Workshop mit erstem Tag an und liefert beide Ids.',
      inputSchema: {
        title: z.string().trim().min(1).max(300),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      },
    },
    async ({ title, date }) => {
      requireScope(actor, 'workshops:write')
      return withTenant(actor, async (tx) => {
        const created = await createWorkshop(tx, actor, { title, date: date ?? null })
        await audit(tx, 'workshop.create', created.workshopId, { title })
        return ok(
          `Angelegt: ${title}\nworkshopId=${created.workshopId}\ndayId=${created.dayId}`,
          created,
        )
      })
    },
  )

  server.registerTool(
    'apply_agenda',
    {
      title: 'Tagesablauf schreiben',
      description:
        'Schreibt einen kompletten Tagesablauf in einem Zug. `replace` ersetzt den Tag, `append` hängt an. ' +
        'Für das Erstellen eines Ablaufs immer dieses Werkzeug benutzen — nicht zwanzig einzelne Aufrufe.',
      inputSchema: {
        workshopId: z.string().uuid(),
        dayId: z.string().uuid(),
        mode: z.enum(['replace', 'append']).default('append'),
        expectedVersion: z.string().regex(/^\d+$/).optional(),
        items: z.array(
          z.union([
            z.object({
              kind: z.literal('cluster'),
              title: z.string().min(1),
              color: z.string().optional(),
              children: z
                .array(
                  z.object({
                    typeKey: z.string(),
                    title: z.string().optional(),
                    durationMinutes: z.number().int().min(0).max(1440).optional(),
                    pinnedStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
                  }),
                )
                .optional(),
            }),
            z.object({
              kind: z.literal('module'),
              typeKey: z.string(),
              title: z.string().optional(),
              durationMinutes: z.number().int().min(0).max(1440).optional(),
              pinnedStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
            }),
          ]),
        ),
      },
    },
    async ({ workshopId, dayId, mode, items, expectedVersion }) => {
      requireScope(actor, 'workshops:write')
      try {
        return await withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
          const result = await applyAgenda(
            tx,
            access,
            dayId,
            mode,
            items,
            expectedVersion === undefined ? undefined : BigInt(expectedVersion),
          )
          await audit(tx, 'agenda.apply', workshopId, { dayId, mode, created: result.created })
          return ok(`${result.created} Einträge geschrieben.`, {
            created: result.created,
            contentVersion: result.contentVersion.toString(),
          })
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'add_module',
    {
      title: 'Block hinzufügen',
      description: 'Hängt einen einzelnen Block an. Für ganze Abläufe apply_agenda benutzen.',
      inputSchema: {
        workshopId: z.string().uuid(),
        dayId: z.string().uuid(),
        typeKey: z.string(),
        title: z.string().optional(),
        durationMinutes: z.number().int().min(0).max(1440).optional(),
        expectedVersion: z.string().regex(/^\d+$/).optional(),
      },
    },
    async ({ workshopId, dayId, typeKey, title, durationMinutes, expectedVersion }) => {
      requireScope(actor, 'workshops:write')
      try {
        return await withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
          const types = await tx
            .select({ id: moduleType.id, name: moduleType.name, key: moduleType.key })
            .from(moduleType)
          const type = types.find((t) => t.key === typeKey)
          if (!type) {
            return fail(
              `Unbekannter Modultyp "${typeKey}". Verfügbar: ${types.map((t) => t.key).join(', ')}`,
            )
          }

          const created = await addModule(
            tx,
            access,
            {
              dayId,
              clusterId: null,
              moduleTypeId: type.id,
              title: title ?? type.name,
              durationMinutes,
            },
            expectedVersion === undefined ? undefined : BigInt(expectedVersion),
          )
          await audit(tx, 'module.create', workshopId, { moduleId: created.id, typeKey })
          return ok(`Block angelegt: ${created.id}`, {
            id: created.id,
            contentVersion: created.contentVersion.toString(),
          })
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'move_module',
    {
      title: 'Block verschieben',
      description:
        'Verschiebt einen Block. `afterId` ist die Id des Blocks, hinter dem er landen soll, oder null für ganz oben.',
      inputSchema: {
        workshopId: z.string().uuid(),
        moduleId: z.string().uuid(),
        dayId: z.string().uuid(),
        clusterId: z.string().uuid().nullable().default(null),
        afterId: z.string().uuid().nullable().default(null),
        expectedVersion: z.string().regex(/^\d+$/).optional(),
      },
    },
    async ({ workshopId, moduleId, dayId, clusterId, afterId, expectedVersion }) => {
      requireScope(actor, 'workshops:write')
      try {
        return await withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
          const version = await moveModule(
            tx,
            access,
            moduleId,
            { dayId, clusterId },
            afterId,
            expectedVersion === undefined ? undefined : BigInt(expectedVersion),
          )
          await audit(tx, 'module.move', workshopId, { moduleId })
          return ok('Verschoben.', { contentVersion: version.toString() })
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'delete_module',
    {
      title: 'Block löschen',
      description: 'Löscht einen Block endgültig.',
      inputSchema: {
        workshopId: z.string().uuid(),
        moduleId: z.string().uuid(),
        expectedVersion: z.string().regex(/^\d+$/).optional(),
      },
    },
    async ({ workshopId, moduleId, expectedVersion }) => {
      requireScope(actor, 'workshops:write')
      try {
        return await withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
          const version = await deleteModule(
            tx,
            access,
            moduleId,
            expectedVersion === undefined ? undefined : BigInt(expectedVersion),
          )
          await audit(tx, 'module.delete', workshopId, { moduleId })
          return ok('Gelöscht.', { contentVersion: version.toString() })
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'set_day_start',
    {
      title: 'Tagesbeginn setzen',
      description:
        'Setzt die Startzeit eines Tages in Minuten seit Mitternacht (z. B. 540 = 09:00).',
      inputSchema: {
        workshopId: z.string().uuid(),
        dayId: z.string().uuid(),
        startMinute: z.number().int().min(0).max(1439),
      },
    },
    async ({ workshopId, dayId, startMinute }) => {
      requireScope(actor, 'workshops:write')
      return withTenant(actor, async (tx) => {
        await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
        await tx
          .update(workshopDay)
          .set({
            startTime: `${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}:00`,
          })
          .where(and(eq(workshopDay.id, dayId), eq(workshopDay.workshopId, workshopId)))
        await audit(tx, 'day.update', workshopId, { dayId, startMinute })
        return ok(`Tagesbeginn: ${formatTime(startMinute)}`)
      })
    },
  )
}

/**
 * Errors as instructions.
 *
 * A stale-version failure in particular has to say what to do next, or a model
 * will retry the same call forever.
 */
function toolError(error: unknown) {
  if (error instanceof VersionConflictError) {
    return fail(
      `Der Workshop wurde inzwischen geändert (aktuelle Version: ${error.actual}). ` +
        'Lies ihn mit get_workshop neu und schicke die neue contentVersion mit.',
    )
  }
  return fail(error instanceof Error ? error.message : 'Unbekannter Fehler.')
}
