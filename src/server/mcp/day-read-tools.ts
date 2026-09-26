import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { localiseModuleType } from '@/domain/moduleType/localise'
import { firstDayOf } from '@/domain/workshop/days'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { parkedElsewhere } from '@/server/collab/across-days'
import { renderDayMarkdown } from '@/server/export/markdown'
import { withTenant } from '@/server/db'
import { moduleType, workshop } from '@/server/db/schema'
import { LOCALES } from '@/i18n/config'
import { requireScope } from './auth'
import { fail, guarded, ok } from './respond'
import { Id, MCP_LOCALE, type Ctx } from './shared'

/**
 * Reading a day.
 *
 * Two tools, and between them the whole picture a model needs before it writes
 * anything: which block types exist and what their fields accept, and what is
 * on the day right now with every id it would have to name.
 *
 * Both read the tables, and neither needs the caller's credential beyond the
 * actor -- which is why this half takes no authorization header while the write
 * half does: a write joins the collaboration room as the caller, a read does
 * not. The writes are next door, the library in ./library-tools.ts.
 */
export function registerDayReadTools(server: McpServer, { actor }: Ctx): void {
  server.registerTool(
    'list_module_types',
    {
      title: 'List block types',
      description:
        'Every available block type with its field schema. Call this before creating blocks: the schemas say which values a type accepts.',
      inputSchema: {},
    },
    async () =>
      guarded(async () => {
        requireScope(actor, 'module_types:read')
        // list_module_types reads the table directly rather than going through
        // loadDay, so the localisation has to happen here too -- in English,
        // like everything else this surface says.
        const rows = await withTenant(actor, (tx) =>
          tx.select().from(moduleType).where(eq(moduleType.isActive, true)),
        )
        const types = rows.map((row) => localiseModuleType(row, MCP_LOCALE))

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
      }),
  )

  server.registerTool(
    'get_workshop',
    {
      title: 'Read a workshop day',
      description:
        'The agenda of a workshop day with computed start times, block ids, cluster ids and parked blocks. ' +
        'The parking area belongs to the whole workshop: `parkedElsewhere` lists the blocks parked on the other days, ' +
        'and move_module with toDayId brings one into this day. ' +
        'The structured `blocks` carry every field update_module can change. `view: markdown` returns the finished export.',
      inputSchema: {
        workshopId: Id,
        dayId: Id.optional(),
        view: z.enum(['outline', 'markdown']).default('outline'),
        /**
         * The one place this surface is not English.
         *
         * `view: markdown` returns a document a person will paste somewhere,
         * so it takes the language they asked for rather than the one the
         * tool descriptions happen to be written in. Everything else here --
         * titles, descriptions, errors -- is prompt material for a model.
         */
        locale: z
          .enum(LOCALES)
          .optional()
          .describe('Language for `view: markdown`. Defaults to English.'),
      },
    },
    async ({ workshopId, dayId, view, locale }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')

        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
          const resolvedDayId = dayId ?? (await firstDayOf(tx, workshopId))
          if (!resolvedDayId) return fail('This workshop has no day yet.')

          const { doc, contentVersion } = await loadDay(
            tx,
            access,
            resolvedDayId,
            locale ?? MCP_LOCALE,
          )
          const meta = await tx
            .select({ title: workshop.title })
            .from(workshop)
            .where(eq(workshop.id, workshopId))
            .limit(1)
          const title = meta[0]?.title ?? 'Workshop'

          if (view === 'markdown') {
            return ok(renderDayMarkdown({ title }, doc, { locale: locale ?? MCP_LOCALE }), {
              contentVersion: contentVersion.toString(),
            })
          }

          const rows = flattenDay(doc)
          const schedule = computeSchedule(doc.startMinute, toScheduleItems(rows))
          const typeKey = (id: string) => doc.moduleTypes[id]?.key ?? null
          const startOf = (id: string) => schedule.entries.get(id)?.startMinute ?? null

          const lines = rows.map((row, index) => {
            const entry = schedule.entries.get(row.id)
            const time = entry ? formatTime(entry.startMinute, MCP_LOCALE) : '--:--'
            if (row.kind === 'cluster') {
              return `${index}. [${time}] ## ${row.cluster.title} · cluster · id=${row.id}`
            }
            if (row.kind !== 'module') return `${index}. [${time}] (buffer)`
            const pinned = row.module.pinnedStartMinute === null ? '' : ' · pinned'
            const who = row.module.responsible.map((person) => person.name).join(', ')
            const responsible = who ? ` · responsible: ${who}` : ''
            return `${index}. [${time}] ${row.depth === 1 ? '  ' : ''}${row.module.title} · ${formatDuration(row.module.durationMinutes)} · ${typeKey(row.module.moduleTypeId) ?? '?'}${pinned}${responsible} · id=${row.id}`
          })

          // Parked blocks are out of the running order, so flattenDay leaves
          // them out. A model that cannot see them cannot bring one back.
          const parked = doc.modules.filter((m) => m.parked)
          // And the rest of the shelf, which is not on this day at all.
          const elsewhere = await parkedElsewhere(tx, workshopId, resolvedDayId)
          const note = typeof doc.desc?.text === 'string' ? doc.desc.text : ''

          const blocks = [
            ...doc.clusters.map((c) => ({
              id: c.id,
              kind: 'cluster' as const,
              parentId: null,
              order: c.order,
              title: c.title,
              color: c.color,
              pinnedStartMinute: c.pinnedStartMinute,
              startMinute: startOf(c.id),
            })),
            ...doc.modules.map((m) => ({
              id: m.id,
              kind: 'module' as const,
              parentId: m.clusterId,
              order: m.order,
              title: m.title,
              typeKey: typeKey(m.moduleTypeId),
              durationMinutes: m.durationMinutes,
              pinnedStartMinute: m.pinnedStartMinute,
              parked: m.parked,
              responsible: m.responsible,
              desc: m.desc,
              startMinute: m.parked ? null : startOf(m.id),
            })),
          ]

          return ok(
            [
              `${title} — ${doc.title || 'Day'}${doc.date ? ` (${doc.date})` : ''}`,
              `Day starts at ${formatTime(doc.startMinute, MCP_LOCALE)}`,
              ...(note ? [`Note: ${note}`] : []),
              `contentVersion: ${contentVersion} (send this back with any change)`,
              '',
              ...lines,
              ...(parked.length > 0
                ? [
                    '',
                    'Parked on this day (not scheduled):',
                    ...parked.map(
                      (m) =>
                        `- ${m.title} · ${formatDuration(m.durationMinutes)} · ${typeKey(m.moduleTypeId) ?? '?'} · id=${m.id}`,
                    ),
                  ]
                : []),
              ...(elsewhere.length > 0
                ? [
                    '',
                    'Parked on other days (bring one here with move_module, dayId=<its day>, toDayId=this day):',
                    ...elsewhere.map(
                      (m) =>
                        `- ${m.title} · ${formatDuration(m.durationMinutes)} · ${typeKey(m.moduleTypeId) ?? '?'} · dayId=${m.dayId} · id=${m.id}`,
                    ),
                  ]
                : []),
            ].join('\n'),
            {
              contentVersion: contentVersion.toString(),
              dayId: resolvedDayId,
              day: {
                title: doc.title,
                date: doc.date,
                startMinute: doc.startMinute,
                note,
              },
              blocks,
              parkedElsewhere: elsewhere.map((m) => ({
                id: m.id,
                dayId: m.dayId,
                title: m.title,
                durationMinutes: m.durationMinutes,
                typeKey: typeKey(m.moduleTypeId),
              })),
            },
          )
        })
      }),
  )
}
