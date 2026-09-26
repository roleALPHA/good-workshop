import { z } from 'zod'
import { uuidv7 } from 'uuidv7'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ModuleDescError, validateModuleDesc, type FieldError } from '@/domain/moduleType/validate'
import { addClusterBlock, addModuleBlock, clearBlocks, patchBlock } from '@/domain/collab/ops'
import { CATEGORY_COLORS } from '@/lib/category-colors'
import { publicToolError } from './errors'
import { fail, guarded, ok, toolError } from './respond'
import { requireScope } from './auth'
import { Id, Version, type Ctx } from './shared'
import {
  dayWriter,
  Duration,
  givenFields,
  Minute,
  moduleFrom,
  PeopleInput,
  planUpdate,
  problemText,
  readSchemas,
  readTypes,
  UpdateFields,
  unknownTypes,
  type PlannedInput,
  type TypeSchema,
} from './day-write'

/**
 * Writing many blocks in one call.
 *
 * Both tools here exist because the alternative is twenty calls, and twenty
 * calls is where a model loses track: it reads a day, writes the third block,
 * and by the tenth it is working from an agenda that no longer exists. So both
 * are all-or-nothing -- one bad type key or one description that does not fit
 * its schema and nothing is written, with every problem named at once rather
 * than the first one.
 *
 * Single blocks are in ./day-block-tools.ts, the day itself in ./day-tools.ts,
 * and what all three are made of in ./day-write.ts.
 */
export function registerDayAgendaTools(server: McpServer, ctx: Ctx): void {
  const { actor } = ctx
  const { inRoom, preflight, lookUpPeople, record } = dayWriter(ctx)

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
    responsible: PeopleInput.optional(),
  }

  server.registerTool(
    'apply_agenda',
    {
      title: 'Write a day agenda',
      description:
        'Writes a complete day agenda in one go, every block with all its fields: title, duration, ' +
        'pinned start, parked, responsible (who answers for the block, members and outsiders) and ' +
        "`desc` -- the block type's own fields such as presenter, materials " +
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

        const people = await lookUpPeople(
          items.flatMap((item, i) =>
            item.kind === 'module'
              ? [{ at: `items[${i}]`, people: item.responsible }]
              : (item.children ?? []).map((child, j) => ({
                  at: `items[${i}].children[${j}]`,
                  people: child.responsible,
                })),
          ),
        )
        if (people.problems.length > 0) {
          return fail(['Nothing was written.', ...people.problems].join('\n'))
        }

        const { result, contentVersion, rejected } = await inRoom(workshopId, dayId, (doc) => {
          let created = 0
          doc.transact(() => {
            if (mode === 'replace') clearBlocks(doc)

            items.forEach((item, i) => {
              if (item.kind === 'module') {
                addModuleBlock(doc, uuidv7(), {
                  ...moduleFrom(item, types),
                  desc: descs.get(`items[${i}]`),
                  responsible: people.values.get(`items[${i}]`),
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
                  responsible: people.values.get(`items[${i}].children[${j}]`),
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
        const people = await lookUpPeople(
          entries.map((entry, i) => ({ at: `updates[${i}]`, people: entry.fields.responsible })),
        )
        if (people.problems.length > 0) {
          return fail(['Nothing was changed.', ...people.problems].join('\n'))
        }
        const planned = entries.map((entry, i): PlannedInput => ({
          ...entry.fields,
          responsible: people.values.get(`updates[${i}]`),
        }))

        // Every entry is checked against the document before any is written: a
        // day where the first nine blocks changed and the tenth did not is
        // harder to recover from than a call that did nothing.
        const { result, contentVersion, rejected } = await inRoom(workshopId, dayId, (doc) => {
          const plans = entries.map((entry, i) =>
            planUpdate(doc, entry.moduleId, planned[i]!, schemas ?? new Map()),
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
}
