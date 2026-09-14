import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type * as Y from 'yjs'
import { uuidv7 } from 'uuidv7'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  assertWorkshopAccess,
  NotFoundError,
  VersionConflictError,
  type WorkshopAccess,
} from '@/domain/agenda/access'
import { assertDayInWorkshop, loadDay } from '@/domain/agenda/repo'
import { localiseModuleType } from '@/domain/moduleType/localise'
import { ModuleDescError, validateModuleDesc, type FieldError } from '@/domain/moduleType/validate'
import { setDayDate } from '@/domain/workshop/days'
import { CATEGORY_COLORS } from '@/lib/category-colors'
import { publicToolError } from './errors'
import { fail, guarded, ok, toolError } from './respond'

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
  patchBlock,
  removeBlock,
  setDayFields,
  type BlockPatch,
  type NewModuleBlock,
} from '@/domain/collab/ops'
import { blocksOf, dayOf } from '@/domain/collab/doc'
import { firstDayOf } from '@/domain/workshop/repo'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { moveModuleToDay, parkedElsewhere, roomEditor } from '@/server/collab/across-days'
import { editInRoom } from '@/server/collab/client'
import { renderDayMarkdown } from '@/server/export/markdown'
import { withTenant, type Tx } from '@/server/db'
import { auditEvent, moduleType, workshop } from '@/server/db/schema'
import { requireScope, type PatActor } from './auth'
import { LOCALES } from '@/i18n/config'

/**
 * The tools an LLM client gets for the CONTENT of a day. The library -- folders,
 * workshops, tags, the bin, adding and removing days -- is in ./library-tools.
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

const Id = z.string().uuid()
const Version = z.string().regex(/^\d+$/).optional()
const Minute = z.number().int().min(0).max(1439)
const Duration = z.number().int().min(0).max(1440)

/** What update_module and update_modules may change; which applies depends on the kind. */
const UpdateFields = {
  title: z.string().trim().min(1).max(300).optional(),
  durationMinutes: Duration.optional(),
  pinnedStartMinute: Minute.nullable().optional(),
  desc: z.record(z.string(), z.unknown()).optional(),
  parked: z.boolean().optional(),
  color: z.enum(CATEGORY_COLORS).nullable().optional(),
}
type UpdateInput = z.infer<z.ZodObject<typeof UpdateFields>>

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
            return `${index}. [${time}] ${row.depth === 1 ? '  ' : ''}${row.module.title} · ${formatDuration(row.module.durationMinutes)} · ${typeKey(row.module.moduleTypeId) ?? '?'}${pinned} · id=${row.id}`
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

  // ── Agenda writes ───────────────────────────────────────────────────────
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

  // Everything a block can carry, so a whole agenda -- with every block's
  // fields filled in -- is one call rather than one apply and twenty updates.
  const BlockFields = {
    typeKey: z.string(),
    title: z.string().optional(),
    durationMinutes: Duration.optional(),
    pinnedStartMinute: Minute.nullable().optional(),
    desc: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "The block type's own fields (presenter, materials, description, ...), " +
          'shaped by its schema from list_module_types. Left out, the block starts empty.',
      ),
    parked: z.boolean().optional().describe('true puts the block straight into the parking area.'),
  }

  server.registerTool(
    'apply_agenda',
    {
      title: 'Write a day agenda',
      description:
        'Writes a complete day agenda in one go, every block with all its fields: title, duration, ' +
        "pinned start, parked and `desc` -- the block type's own fields such as presenter, materials " +
        'or description, matching its schema from list_module_types. `replace` replaces the day, ' +
        '`append` adds to it. All or nothing: if one block names an unknown type or a `desc` that ' +
        'does not fit its schema, nothing is written. ' +
        'Always use this tool to build or fill in an agenda -- not twenty separate calls.',
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        mode: z.enum(['replace', 'append']).default('append'),
        expectedVersion: Version,
        items: z.array(
          z.union([
            z.object({
              kind: z.literal('cluster'),
              title: z.string().min(1),
              color: z.enum(CATEGORY_COLORS).optional(),
              pinnedStartMinute: Minute.nullable().optional(),
              children: z.array(z.object(BlockFields)).optional(),
            }),
            z.object({ kind: z.literal('module'), ...BlockFields }),
          ]),
        ),
      },
    },
    async ({ workshopId, dayId, mode, items, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        const types = await preflight(workshopId, expectedVersion, (tx) => readTypes(tx))
        if (!types) return fail('The block types could not be read.')

        // Every type is resolved before anything is written: a day half
        // applied because the eleventh block named a type that does not exist
        // is worse than a day not applied at all.
        const wanted = items.flatMap((item) =>
          item.kind === 'cluster' ? (item.children ?? []).map((c) => c.typeKey) : [item.typeKey],
        )
        const unknown = [...new Set(wanted)].filter((key) => !types.has(key))
        if (unknown.length > 0) return fail(unknownTypes(unknown, types))

        // The same for every description, and every problem at once: the
        // path names the item, so the next call can fix them all.
        const issues: FieldError[] = []
        const descs = new Map<string, Record<string, unknown>>()
        const check = (block: { typeKey: string; desc?: Record<string, unknown> }, at: string) => {
          if (block.desc === undefined) return
          const validated = validateModuleDesc(types.get(block.typeKey)!, block.desc)
          if (validated.ok) descs.set(at, validated.value)
          else
            issues.push(
              ...validated.errors.map((e) => ({
                ...e,
                path: e.path ? `${at}.desc.${e.path}` : `${at}.desc`,
              })),
            )
        }
        items.forEach((item, i) => {
          if (item.kind === 'module') return check(item, `items[${i}]`)
          item.children?.forEach((child, j) => check(child, `items[${i}].children[${j}]`))
        })
        if (issues.length > 0) return toolError(new ModuleDescError(issues))

        const { result, contentVersion, rejected } = await inRoom(workshopId, dayId, (doc) => {
          let created = 0
          doc.transact(() => {
            if (mode === 'replace') clearBlocks(doc)

            items.forEach((item, i) => {
              if (item.kind === 'module') {
                addModuleBlock(doc, uuidv7(), {
                  ...moduleFrom(item, types),
                  desc: descs.get(`items[${i}]`),
                })
                created += 1
                return
              }

              const clusterId = uuidv7()
              addClusterBlock(doc, clusterId, { title: item.title, color: item.color ?? null })
              if (item.pinnedStartMinute != null) {
                patchBlock(doc, clusterId, { pinnedStartMinute: item.pinnedStartMinute })
              }
              created += 1
              item.children?.forEach((child, j) => {
                addModuleBlock(doc, uuidv7(), {
                  ...moduleFrom(child, types),
                  desc: descs.get(`items[${i}].children[${j}]`),
                  parentId: clusterId,
                })
                created += 1
              })
            })
          })
          return created
        })

        await record('agenda.apply', workshopId, { dayId, mode, created: result, rejected })
        // Saying "10 entries written" while one of them did not reach the
        // record would be telling the caller something untrue. The block keeps
        // whatever it held before; see validatedDescs in collab/materialize.
        return ok(
          rejected > 0
            ? `${result} entries written, ${rejected} refused by the block type's schema and left unchanged.`
            : `${result} entries written.`,
          {
            created: result,
            ...(rejected > 0 ? { rejected } : {}),
            contentVersion: contentVersion.toString(),
          },
        )
      }),
  )

  server.registerTool(
    'add_module',
    {
      title: 'Add a block',
      description:
        'Appends a single block to the end of the day or of a cluster. ' +
        'Use apply_agenda for whole agendas.',
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        typeKey: z.string(),
        title: z.string().optional(),
        durationMinutes: Duration.optional(),
        clusterId: Id.nullable().default(null),
        expectedVersion: Version,
      },
    },
    async ({ workshopId, dayId, typeKey, title, durationMinutes, clusterId, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        const types = await preflight(workshopId, expectedVersion, (tx) => readTypes(tx))
        if (!types) return fail('The block types could not be read.')
        if (!types.has(typeKey)) return fail(unknownTypes([typeKey], types))

        const id = uuidv7()
        const { contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          addModuleBlock(doc, id, {
            ...moduleFrom({ typeKey, title, durationMinutes }, types),
            parentId: clusterId,
          }),
        )

        await record('module.create', workshopId, { moduleId: id, typeKey })
        return ok(`Block created: ${id}`, { id, contentVersion: contentVersion.toString() })
      }),
  )

  server.registerTool(
    'add_cluster',
    {
      title: 'Add a cluster',
      description:
        'Appends a cluster -- a titled section that groups blocks -- to the end of the day. ' +
        'Put blocks into it with add_module (clusterId) or move_module.',
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        title: z.string().trim().min(1).max(300),
        color: z.enum(CATEGORY_COLORS).optional(),
        expectedVersion: Version,
      },
    },
    async ({ workshopId, dayId, title, color, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        await preflight(workshopId, expectedVersion)

        const id = uuidv7()
        const { contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          addClusterBlock(doc, id, { title, color: color ?? null }),
        )

        await record('cluster.create', workshopId, { clusterId: id })
        return ok(`Cluster created: ${id}`, { id, contentVersion: contentVersion.toString() })
      }),
  )

  server.registerTool(
    'update_module',
    {
      title: 'Change a block or cluster',
      description:
        'Changes fields of one block or cluster; fields you leave out stay as they are. ' +
        'A block takes title, durationMinutes, pinnedStartMinute (null unpins), desc and parked ' +
        '(true sets it aside: kept with the day, out of the schedule). A cluster takes title, color ' +
        'and pinnedStartMinute. `desc` replaces the whole description and must match the block ' +
        "type's schema from list_module_types; read the current one from get_workshop.",
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        moduleId: Id.describe('The id of a block or a cluster, from get_workshop.'),
        ...UpdateFields,
        expectedVersion: Version,
      },
    },
    async ({ workshopId, dayId, moduleId, expectedVersion, ...fields }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        const given = givenFields(fields)
        if (given.length === 0) return fail('Nothing to change: pass at least one field.')

        // Schemas are read up front: the edit runs inside the room, where there
        // is no database to ask, and a description is validated BEFORE it is
        // written rather than refused by the materialiser afterwards.
        const schemas = await preflight(workshopId, expectedVersion, (tx) =>
          fields.desc === undefined
            ? Promise.resolve(new Map<string, TypeSchema>())
            : readSchemas(tx),
        )

        const { result, contentVersion, rejected } = await inRoom(workshopId, dayId, (doc) => {
          const plan = planUpdate(doc, moduleId, fields, schemas ?? new Map())
          if (plan.kind === 'ok') patchBlock(doc, moduleId, plan.patch)
          return plan
        })

        if (result.kind === 'invalid') return toolError(result.error)
        if (result.kind === 'missing') {
          return fail(`${problemText(result, moduleId)} Read the day again with get_workshop.`)
        }
        if (result.kind === 'wrongKind') return fail(problemText(result, moduleId))

        await record('module.update', workshopId, { moduleId, fields: given })
        return ok(
          rejected > 0 ? 'Updated, but the description was refused by the schema.' : 'Updated.',
          { contentVersion: contentVersion.toString(), ...(rejected > 0 ? { rejected } : {}) },
        )
      }),
  )

  server.registerTool(
    'update_modules',
    {
      title: 'Change many blocks at once',
      description:
        'Changes fields of many blocks and clusters of one day in a single call -- the way to fill in ' +
        'or rework an existing agenda without one update_module per block. Each entry takes moduleId ' +
        'plus the fields update_module takes; fields left out stay as they are, and ids stay the same. ' +
        'All or nothing: if one entry names a block that is not on this day, a field its kind does not ' +
        "take, or a desc that does not fit its type's schema, nothing is changed and every problem is named.",
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        updates: z
          .array(
            z.object({
              moduleId: Id.describe('The id of a block or a cluster, from get_workshop.'),
              ...UpdateFields,
            }),
          )
          .min(1)
          .max(500),
        expectedVersion: Version,
      },
    },
    async ({ workshopId, dayId, updates, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        const entries = updates.map(({ moduleId, ...fields }) => ({
          moduleId,
          fields,
          given: givenFields(fields),
        }))
        const empty = entries.flatMap((entry, i) =>
          entry.given.length === 0 ? [`updates[${i}]`] : [],
        )
        if (empty.length > 0) {
          return fail(
            `Nothing to change in ${empty.join(', ')}: pass at least one field per entry.`,
          )
        }

        const schemas = await preflight(workshopId, expectedVersion, (tx) =>
          entries.every((entry) => entry.fields.desc === undefined)
            ? Promise.resolve(new Map<string, TypeSchema>())
            : readSchemas(tx),
        )

        // Every entry is checked against the document before any is written: a
        // day where the first nine blocks changed and the tenth did not is
        // harder to recover from than a call that did nothing.
        const { result, contentVersion, rejected } = await inRoom(workshopId, dayId, (doc) => {
          const plans = entries.map((entry) =>
            planUpdate(doc, entry.moduleId, entry.fields, schemas ?? new Map()),
          )
          const problems: string[] = []
          const descIssues: FieldError[] = []
          plans.forEach((plan, i) => {
            if (plan.kind === 'ok') return
            if (plan.kind === 'invalid') {
              descIssues.push(
                ...plan.error.issues.map((issue) => ({
                  ...issue,
                  path: issue.path ? `updates[${i}].desc.${issue.path}` : `updates[${i}].desc`,
                })),
              )
              return
            }
            problems.push(`updates[${i}]: ${problemText(plan, entries[i]!.moduleId)}`)
          })
          if (problems.length > 0 || descIssues.length > 0) return { problems, descIssues }

          doc.transact(() => {
            plans.forEach((plan, i) => {
              if (plan.kind === 'ok') patchBlock(doc, entries[i]!.moduleId, plan.patch)
            })
          })
          return { problems, descIssues }
        })

        if (result.problems.length > 0 || result.descIssues.length > 0) {
          return fail(
            [
              'Nothing was changed.',
              ...result.problems,
              ...(result.descIssues.length > 0
                ? [publicToolError(new ModuleDescError(result.descIssues)).message]
                : []),
              ...(result.problems.some((p) => p.includes('is not on this day'))
                ? ['Read the day again with get_workshop.']
                : []),
            ].join('\n'),
          )
        }

        await record('module.update', workshopId, {
          moduleIds: entries.map((entry) => entry.moduleId),
          fields: [...new Set(entries.flatMap((entry) => entry.given))],
        })
        return ok(
          rejected > 0
            ? `${entries.length} updates applied, but ${rejected} description(s) were refused by the schema.`
            : `${entries.length} updates applied.`,
          { contentVersion: contentVersion.toString(), ...(rejected > 0 ? { rejected } : {}) },
        )
      }),
  )

  server.registerTool(
    'move_module',
    {
      title: 'Move a block',
      description:
        'Moves a block or cluster. `clusterId` is the cluster it goes into (null = day level; clusters ' +
        'always stay at day level). `afterId` is the id of the sibling it should land after, or null for the top. ' +
        '`toDayId` moves a block (not a cluster) to the end of another day of the same workshop -- the way to bring a ' +
        'block from the parking area of one day into another. It gets a new id there, returned as `id`; ' +
        '`parked` says whether it lands in the schedule (false) or stays parked (true, or left out).',
      inputSchema: {
        workshopId: Id,
        moduleId: Id,
        dayId: Id.describe('The day the block is on now.'),
        clusterId: Id.nullable().default(null),
        afterId: Id.nullable().default(null),
        toDayId: Id.optional(),
        parked: z.boolean().optional(),
        expectedVersion: Version,
      },
    },
    async ({ workshopId, moduleId, dayId, clusterId, afterId, toDayId, parked, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')

        if (toDayId !== undefined && toDayId !== dayId) {
          await preflight(workshopId, expectedVersion, async (tx, access) => {
            await assertDayInWorkshop(tx, access, dayId)
            await assertDayInWorkshop(tx, access, toDayId)
          })

          try {
            const moved = await moveModuleToDay(
              roomEditor({ workshopId, authorization, presence }),
              { moduleId, fromDayId: dayId, toDayId, parked },
            )
            await record('module.move', workshopId, {
              moduleId,
              arrivedAs: moved.moduleId,
              fromDayId: dayId,
              toDayId,
            })
            return ok(`Moved to day ${toDayId}. Its id there: ${moved.moduleId}`, {
              id: moved.moduleId,
              contentVersion: moved.contentVersion.toString(),
            })
          } catch (error) {
            if (!(error instanceof NotFoundError)) throw error
            return fail(
              `Block ${moduleId} is not a block on day ${dayId}; clusters cannot change day. ` +
                'Read the day again with get_workshop.',
            )
          }
        }

        await preflight(workshopId, expectedVersion)
        const { result, contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          moveBlock(doc, moduleId, clusterId, afterId),
        )
        if (!result) {
          return fail(
            `Block ${moduleId} is not on this day, or the target cluster does not exist. ` +
              'Read the day again with get_workshop.',
          )
        }

        await record('module.move', workshopId, { moduleId })
        return ok('Moved.', { id: moduleId, contentVersion: contentVersion.toString() })
      }),
  )

  server.registerTool(
    'delete_module',
    {
      title: 'Delete a block',
      description: 'Deletes a block for good. Deleting a cluster deletes the blocks inside it.',
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        moduleId: Id,
        expectedVersion: Version,
      },
    },
    async ({ workshopId, dayId, moduleId, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        await preflight(workshopId, expectedVersion)
        const { result, contentVersion } = await inRoom(workshopId, dayId, (doc) =>
          removeBlock(doc, moduleId),
        )
        if (result === 0) return fail(`Block ${moduleId} is not on this day.`)

        await record('module.delete', workshopId, { moduleId, removed: result })
        return ok(`Deleted (${result}).`, { contentVersion: contentVersion.toString() })
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

/** What update_module may set, by kind. The editor offers exactly these. */
const MODULE_FIELDS: readonly string[] = [
  'title',
  'durationMinutes',
  'pinnedStartMinute',
  'desc',
  'parked',
]
const CLUSTER_FIELDS: readonly string[] = ['title', 'color', 'pinnedStartMinute']

type UpdateOutcome =
  | { kind: 'ok'; patch: BlockPatch }
  | { kind: 'missing' }
  | { kind: 'wrongKind'; isCluster: boolean; fields: string[] }
  | { kind: 'invalid'; error: ModuleDescError }

function givenFields(fields: UpdateInput): string[] {
  return (Object.keys(fields) as (keyof UpdateInput)[]).filter((key) => fields[key] !== undefined)
}

/**
 * Checks one change against the document and says what it would write.
 *
 * Writes nothing itself, so update_modules can check every entry before it
 * touches any of them.
 */
function planUpdate(
  doc: Y.Doc,
  moduleId: string,
  fields: UpdateInput,
  schemas: Map<string, TypeSchema>,
): UpdateOutcome {
  const block = blocksOf(doc).get(moduleId)
  if (!block) return { kind: 'missing' }

  const isCluster = block.get('kind') === 'cluster'
  const allowed = isCluster ? CLUSTER_FIELDS : MODULE_FIELDS
  const wrong = givenFields(fields).filter((key) => !allowed.includes(key))
  if (wrong.length > 0) return { kind: 'wrongKind', isCluster, fields: wrong }

  const patch: BlockPatch = { ...fields }
  if (fields.desc !== undefined) {
    const type = schemas.get(String(block.get('moduleTypeId') ?? ''))
    if (type) {
      const validated = validateModuleDesc(type, fields.desc)
      if (!validated.ok) return { kind: 'invalid', error: new ModuleDescError(validated.errors) }
      patch.desc = validated.value
    }
  }
  return { kind: 'ok', patch }
}

function problemText(
  outcome: Extract<UpdateOutcome, { kind: 'missing' | 'wrongKind' }>,
  moduleId: string,
): string {
  if (outcome.kind === 'missing') return `Block ${moduleId} is not on this day.`
  const kind = outcome.isCluster ? 'cluster' : 'block'
  return (
    `${outcome.fields.join(', ')} cannot be set on a ${kind}. ` +
    `A ${kind} takes: ${(outcome.isCluster ? CLUSTER_FIELDS : MODULE_FIELDS).join(', ')}.`
  )
}

type ResolvedType = TypeSchema & { name: string; defaultDurationMinutes: number }

async function readTypes(tx: Tx): Promise<Map<string, ResolvedType>> {
  const rows = await tx
    .select({
      id: moduleType.id,
      key: moduleType.key,
      name: moduleType.name,
      defaultDurationMinutes: moduleType.defaultDurationMinutes,
      schemaVersion: moduleType.schemaVersion,
      jsonSchema: moduleType.jsonSchema,
    })
    .from(moduleType)
  return new Map(rows.map((row) => [row.key, row]))
}

type TypeSchema = { id: string; schemaVersion: number; jsonSchema: unknown }

/** Keyed by id, because that is what a block in the document names. */
async function readSchemas(tx: Tx): Promise<Map<string, TypeSchema>> {
  const rows = await tx
    .select({
      id: moduleType.id,
      schemaVersion: moduleType.schemaVersion,
      jsonSchema: moduleType.jsonSchema,
    })
    .from(moduleType)
  return new Map(rows.map((row) => [row.id, row]))
}

function moduleFrom(
  input: {
    typeKey: string
    title?: string
    durationMinutes?: number
    pinnedStartMinute?: number | null
    parked?: boolean
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
    parked: input.parked,
  }
}

/** Errors name the allowed values, so the next call can be right. */
function unknownTypes(keys: string[], types: Map<string, ResolvedType>): string {
  return `Unknown block types: ${keys.join(', ')}. ` + `Available: ${[...types.keys()].join(', ')}`
}
