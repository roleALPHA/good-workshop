import { z } from 'zod'
import { desc, eq, isNull } from 'drizzle-orm'
import type * as Y from 'yjs'
import { uuidv7 } from 'uuidv7'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  assertWorkshopAccess,
  VersionConflictError,
  type WorkshopAccess,
} from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { localiseModuleType } from '@/domain/moduleType/localise'
import { publicToolError } from './errors'

/**
 * MCP answers in English, always.
 *
 * The audience is a model, and the text is prompt material it decides its next
 * call from. See the note in ./errors.ts; `get_workshop` takes an explicit
 * locale for the Markdown a human will actually read.
 */
const MCP_LOCALE = 'en' as const
import {
  addClusterBlock,
  addModuleBlock,
  clearBlocks,
  moveBlock,
  removeBlock,
  setDayFields,
  type NewModuleBlock,
} from '@/domain/collab/ops'
import { createWorkshop, firstDayOf, listDays } from '@/domain/workshop/repo'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { editInRoom } from '@/server/collab/client'
import { renderDayMarkdown } from '@/server/export/markdown'
import { withTenant, type Tx } from '@/server/db'
import { auditEvent, moduleType, workshop } from '@/server/db/schema'
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

/**
 * The raw Authorization header travels with the context.
 *
 * Writes open a socket to the collaboration room, and the room authenticates
 * the same credential the tool call arrived with -- rather than the MCP server
 * holding some second, more powerful key. There is still no privileged path.
 */
type Ctx = { actor: PatActor; authorization: string }

const ok = (text: string, structured?: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text }],
  ...(structured ? { structuredContent: structured } : {}),
})

const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true })

export function registerTools(server: McpServer, ctx: Ctx): void {
  const { actor, authorization } = ctx

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

        const { doc, contentVersion } = await loadDay(tx, access, resolvedDayId, MCP_LOCALE)
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
          const time = entry ? formatTime(entry.startMinute, MCP_LOCALE) : '--:--'
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

  // ── Agenda-Schreibvorgänge ──────────────────────────────────────────────
  //
  // Every one of these goes through the collaboration room rather than through
  // the repository, and that is load-bearing rather than tidy. The room's
  // document is what the materialiser writes back to the tables, deleting
  // whatever it does not hold. A tool writing to the tables directly would
  // have its block removed again a few seconds later -- silently, and only
  // when somebody happened to have the day open, which is the worst possible
  // shape for a bug. One day has one write path.
  //
  // The side effect is what we actually wanted: the model joins the room like
  // anybody else, so a person editing the day sees it arrive.

  // Announced as a model, not merely as a name. Somebody watching their
  // agenda change under their hands is owed the difference between a colleague
  // and something a colleague pointed at their workshop.
  const presence = { name: 'KI-Assistent', hue: 292, kind: 'model' as const }

  const inRoom = <T>(workshopId: string, dayId: string, edit: (doc: Y.Doc) => T) =>
    editInRoom({ workshopId, dayId, authorization, presence }, edit)

  /**
   * Access and version check before the room is opened.
   *
   * Compare-and-swap still matters even though the CRDT merges: merging is the
   * right answer for two people editing different fields, and the wrong answer
   * for `apply_agenda` with mode=replace, which is destructive on purpose.
   */
  const preflight = async <T>(
    workshopId: string,
    expectedVersion: string | undefined,
    prepare?: (tx: Tx, access: WorkshopAccess) => Promise<T>,
  ): Promise<T | undefined> =>
    withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write')
      if (expectedVersion !== undefined && BigInt(expectedVersion) !== access.contentVersion) {
        throw new VersionConflictError(BigInt(expectedVersion), access.contentVersion)
      }
      return prepare ? prepare(tx, access) : undefined
    })

  /** Bookkeeping, and it never fails a tool call. */
  const record = (action: string, entityId: string | null, data: Record<string, unknown> = {}) =>
    withTenant(actor, (tx) => audit(tx, action, entityId, data)).then(
      () => {},
      () => {},
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
        const types = await preflight(workshopId, expectedVersion, (tx) => readTypes(tx))
        if (!types) return fail('Modultypen konnten nicht gelesen werden.')

        // Every type is resolved before anything is written: a day half
        // applied because the eleventh block named a type that does not exist
        // is worse than a day not applied at all.
        const wanted = items.flatMap((item) =>
          item.kind === 'cluster' ? (item.children ?? []).map((c) => c.typeKey) : [item.typeKey],
        )
        const unknown = [...new Set(wanted)].filter((key) => !types.has(key))
        if (unknown.length > 0) return fail(unknownTypes(unknown, types))

        const { result, contentVersion } = await inRoom(workshopId, dayId, (doc) => {
          let created = 0
          doc.transact(() => {
            if (mode === 'replace') clearBlocks(doc)

            for (const item of items) {
              if (item.kind === 'module') {
                addModuleBlock(doc, uuidv7(), moduleFrom(item, types))
                created += 1
                continue
              }

              const clusterId = uuidv7()
              addClusterBlock(doc, clusterId, { title: item.title, color: item.color ?? null })
              created += 1
              for (const child of item.children ?? []) {
                addModuleBlock(doc, uuidv7(), { ...moduleFrom(child, types), parentId: clusterId })
                created += 1
              }
            }
          })
          return created
        })

        await record('agenda.apply', workshopId, { dayId, mode, created: result })
        return ok(`${result} Einträge geschrieben.`, {
          created: result,
          contentVersion: contentVersion.toString(),
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
      description:
        'Hängt einen einzelnen Block an das Ende des Tages oder eines Clusters. ' +
        'Für ganze Abläufe apply_agenda benutzen.',
      inputSchema: {
        workshopId: z.string().uuid(),
        dayId: z.string().uuid(),
        typeKey: z.string(),
        title: z.string().optional(),
        durationMinutes: z.number().int().min(0).max(1440).optional(),
        clusterId: z.string().uuid().nullable().default(null),
        expectedVersion: z.string().regex(/^\d+$/).optional(),
      },
    },
    async ({ workshopId, dayId, typeKey, title, durationMinutes, clusterId, expectedVersion }) => {
      requireScope(actor, 'workshops:write')
      try {
        const types = await preflight(workshopId, expectedVersion, (tx) => readTypes(tx))
        if (!types) return fail('Modultypen konnten nicht gelesen werden.')
        if (!types.has(typeKey)) return fail(unknownTypes([typeKey], types))

        const id = uuidv7()
        const { contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          addModuleBlock(doc, id, {
            ...moduleFrom({ typeKey, title, durationMinutes }, types),
            parentId: clusterId,
          }),
        )

        await record('module.create', workshopId, { moduleId: id, typeKey })
        return ok(`Block angelegt: ${id}`, { id, contentVersion: contentVersion.toString() })
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
        await preflight(workshopId, expectedVersion)
        const { result, contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          moveBlock(doc, moduleId, clusterId, afterId),
        )
        if (!result) {
          return fail(
            `Block ${moduleId} liegt nicht an diesem Tag, oder das Ziel-Cluster gibt es nicht. ` +
              'Lies den Tag mit get_workshop neu.',
          )
        }

        await record('module.move', workshopId, { moduleId })
        return ok('Verschoben.', { contentVersion: contentVersion.toString() })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'delete_module',
    {
      title: 'Block löschen',
      description:
        'Löscht einen Block endgültig. Bei einem Cluster werden seine Blöcke mitgelöscht.',
      inputSchema: {
        workshopId: z.string().uuid(),
        dayId: z.string().uuid(),
        moduleId: z.string().uuid(),
        expectedVersion: z.string().regex(/^\d+$/).optional(),
      },
    },
    async ({ workshopId, dayId, moduleId, expectedVersion }) => {
      requireScope(actor, 'workshops:write')
      try {
        await preflight(workshopId, expectedVersion)
        const { result, contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          removeBlock(doc, moduleId),
        )
        if (result === 0) return fail(`Block ${moduleId} liegt nicht an diesem Tag.`)

        await record('module.delete', workshopId, { moduleId, removed: result })
        return ok(`Gelöscht (${result}).`, { contentVersion: contentVersion.toString() })
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
      try {
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
      } catch (error) {
        return toolError(error)
      }
    },
  )
}

type ResolvedType = { id: string; name: string; defaultDurationMinutes: number }

async function readTypes(tx: Tx): Promise<Map<string, ResolvedType>> {
  const rows = await tx
    .select({
      id: moduleType.id,
      key: moduleType.key,
      name: moduleType.name,
      defaultDurationMinutes: moduleType.defaultDurationMinutes,
    })
    .from(moduleType)
  return new Map(rows.map((row) => [row.key, row]))
}

function moduleFrom(
  input: {
    typeKey: string
    title?: string
    durationMinutes?: number
    pinnedStartMinute?: number | null
  },
  types: Map<string, ResolvedType>,
): NewModuleBlock {
  const type = types.get(input.typeKey)!
  return {
    moduleTypeId: type.id,
    /**
     * The STORED name, deliberately not the English one this surface otherwise
     * speaks.
     *
     * This is persisted into workshop_module.title, where a person reads it in
     * their own interface afterwards. The canonical row is the honest default
     * there; filling a German facilitator's agenda with English block titles
     * because a model created them would be the wrong kind of consistent. A
     * model that wants a particular title passes one.
     */
    title: input.title ?? type.name,
    durationMinutes: input.durationMinutes ?? type.defaultDurationMinutes,
    pinnedStartMinute: input.pinnedStartMinute ?? null,
  }
}

/** Errors name the allowed values, so the next call can be right. */
function unknownTypes(keys: string[], types: Map<string, ResolvedType>): string {
  return (
    `Unbekannte Modultypen: ${keys.join(', ')}. ` + `Verfügbar: ${[...types.keys()].join(', ')}`
  )
}

/**
 * Errors as instructions.
 *
 * A stale-version failure in particular has to say what to do next, or a model
 * will retry the same call forever.
 */
function toolError(error: unknown) {
  // Every domain error -- not-found, forbidden, unknown block type -- is an
  // answer to the request and reaches the caller intact; everything else is an
  // internal failure and gets an id instead of its innards. See
  // publicToolError, which now renders them all in English from the same
  // catalog the interface uses.
  const { message } = publicToolError(error)

  if (error instanceof VersionConflictError) {
    // The one error that has to say what to do next, or a model retries the
    // same call forever.
    return fail(`${message} Read it again with get_workshop and send the new contentVersion.`)
  }

  return fail(message)
}
