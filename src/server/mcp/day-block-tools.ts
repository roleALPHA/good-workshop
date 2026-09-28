import { z } from 'zod'
import { uuidv7 } from 'uuidv7'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { NotFoundError } from '@/domain/agenda/access'
import { blocksOf, modeOf } from '@/domain/collab/doc'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import {
  addClusterBlock,
  addModuleBlock,
  moveBlock,
  patchBlock,
  removeBlock,
} from '@/domain/collab/ops'
import { moveModuleToDay, roomEditor } from '@/server/collab/across-days'
import { CATEGORY_COLORS } from '@/lib/category-colors'
import { fail, guarded, ok, toolError } from './respond'
import { requireScope } from './auth'
import { Id, Version, type Ctx } from './shared'
import {
  dayWriter,
  moduleFrom,
  MODEL_PRESENCE,
  Duration,
  givenFields,
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
 * Changing one block.
 *
 * Positions are ordinals throughout -- `afterOrdinal`, never a fractional key.
 * A model cannot reason about `a0V` and will cheerfully invent one, so the
 * fractional keys stay inside the document and the surface counts from one, the
 * way the day reads.
 *
 * Whole agendas are in ./day-agenda-tools.ts, the day itself in ./day-tools.ts,
 * and what all three are made of in ./day-write.ts.
 */
export function registerDayBlockTools(server: McpServer, ctx: Ctx): void {
  const { actor, authorization } = ctx
  const { inRoom, preflight, lookUpPeople, record } = dayWriter(ctx)

  server.registerTool(
    'add_module',
    {
      title: 'Add a block',
      description:
        'Appends a single block to the end of the day or of a cluster. ' +
        'Use apply_agenda for whole agendas. `clusterId` may name a section or a STRAND of a ' +
        'breakout -- never the breakout itself, which holds strands and nothing else.',
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
        const { result, contentVersion } = await inRoom(workshopId, dayId, (doc) => {
          // Checked here rather than left to the clamp: a block that quietly
          // lands on the day when the model asked for a breakout looks like it
          // worked, and the next read is a surprise.
          const parent = clusterId === null ? null : blocksOf(doc).get(clusterId)
          if (clusterId !== null && !parent) return 'missingParent' as const
          if (parent && modeOf(parent) === 'parallel') return 'breakoutParent' as const

          addModuleBlock(doc, id, {
            ...moduleFrom({ typeKey, title, durationMinutes }, types),
            parentId: clusterId,
          })
          return 'ok' as const
        })

        if (result === 'missingParent') {
          return fail(
            `Cluster ${clusterId} is not on this day. Read the day again with get_workshop.`,
          )
        }
        if (result === 'breakoutParent') {
          return fail(
            `Cluster ${clusterId} is a breakout. Blocks hang on its strands, not on the ` +
              'breakout itself -- pick one of the strands from get_workshop.',
          )
        }

        await record('module.create', workshopId, { moduleId: id, typeKey })
        return ok(`Block created: ${id}`, { id, contentVersion: contentVersion.toString() })
      }),
  )

  server.registerTool(
    'add_cluster',
    {
      title: 'Add a cluster or a breakout',
      description:
        'Appends a cluster -- a titled section that groups blocks -- to the end of the day. ' +
        'With mode=parallel it is a BREAKOUT instead: a section whose children are strands that ' +
        'all run at the same time, each in its own room. A strand is itself a cluster, added ' +
        'with parentClusterId pointing at the breakout; the blocks then hang on the strand, not ' +
        'on the breakout. Use apply_agenda to write a whole breakout in one call -- this tool ' +
        'adds one section to a day that already exists.',
      inputSchema: {
        workshopId: Id,
        dayId: Id,
        title: z.string().trim().min(1).max(300),
        color: z.enum(CATEGORY_COLORS).optional(),
        mode: z
          .enum(['sequential', 'parallel'])
          .default('sequential')
          .describe(
            'sequential: the blocks inside run one after another. ' +
              'parallel: a breakout -- its strands all start together and it ends when the ' +
              'longest one does. A parallel cluster holds strands, never blocks.',
          ),
        parentClusterId: Id.nullable()
          .default(null)
          .describe(
            'Makes this cluster a strand of that breakout. The id must name a cluster with ' +
              'mode=parallel. A strand is always sequential and cannot hold another cluster.',
          ),
        expectedVersion: Version,
      },
    },
    async ({ workshopId, dayId, title, color, mode, parentClusterId, expectedVersion }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        await preflight(workshopId, expectedVersion)

        const id = uuidv7()
        // The cross-field rules live here and not in the schema: inputSchema is
        // a field record, not a ZodObject, so a refinement has nowhere to go --
        // and even as one it would be invisible in the JSON Schema the model
        // reads, so it could only be run into, never read.
        const { result, contentVersion } = await inRoom(workshopId, dayId, (doc) => {
          if (mode === 'parallel' && parentClusterId !== null) return 'nested' as const
          if (parentClusterId !== null) {
            const parent = blocksOf(doc).get(parentClusterId)
            if (!parent) return 'missingParent' as const
            if (parent.get('kind') !== 'cluster' || modeOf(parent) !== 'parallel') {
              return 'notABreakout' as const
            }
          }
          addClusterBlock(doc, id, { title, color: color ?? null, mode, parentId: parentClusterId })
          return 'ok' as const
        })

        if (result === 'nested') {
          return fail(
            'A breakout cannot sit inside another breakout. Leave parentClusterId out, or use ' +
              'mode=sequential to add a strand to that breakout.',
          )
        }
        if (result === 'missingParent') {
          return fail(
            `Cluster ${parentClusterId} is not on this day. Read the day again with get_workshop.`,
          )
        }
        if (result === 'notABreakout') {
          return fail(
            `Cluster ${parentClusterId} is not a breakout (mode=sequential), so it cannot hold ` +
              'a strand. Put blocks into it with add_module instead.',
          )
        }

        await record('cluster.create', workshopId, { clusterId: id, mode, parentClusterId })
        return ok(mode === 'parallel' ? `Breakout created: ${id}` : `Cluster created: ${id}`, {
          id,
          contentVersion: contentVersion.toString(),
        })
      }),
  )

  server.registerTool(
    'update_module',
    {
      title: 'Change a block or cluster',
      description:
        'Changes fields of one block or cluster; fields you leave out stay as they are. ' +
        'A block takes title, durationMinutes, pinnedStartMinute (null unpins), desc, parked ' +
        '(true sets it aside: kept with the day, out of the schedule) and responsible (the whole list ' +
        'of who answers for it; [] clears it). A cluster takes title, color ' +
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
        const people = await lookUpPeople([{ at: '', people: fields.responsible }])
        if (people.problems.length > 0) return fail(people.problems.join('\n'))
        const planned: PlannedInput = { ...fields, responsible: people.values.get('') }

        const { result, contentVersion, rejected } = await inRoom(workshopId, dayId, (doc) => {
          const plan = planUpdate(doc, moduleId, planned, schemas ?? new Map())
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
    'move_module',
    {
      title: 'Move a block',
      description:
        'Moves a block or cluster. `clusterId` is where it goes: null for day level, the id of a ' +
        'section, or the id of a STRAND of a breakout. A block cannot hang on a breakout itself ' +
        '-- pick one of its strands. A strand moves between breakouts, or to day level, where it ' +
        'becomes an ordinary section; its blocks go with it. A breakout only ever sits at day ' +
        'level. `afterId` is the id of the sibling it should land after, or null for the top. ' +
        '`toDayId` moves a block (not a cluster) to the end of another day of the same workshop ' +
        '-- the way to bring a block from the parking area of one day into another. It lands at ' +
        'day level there, not in a strand, and gets a new id, returned as `id`; ' +
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
              roomEditor({ workshopId, authorization, presence: MODEL_PRESENCE }),
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
              `Block ${moduleId} is not a block on day ${dayId}; sections, breakouts and ` +
                'strands cannot change day -- only the blocks inside them can. ' +
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
            `Block ${moduleId} is not on this day, the target cluster does not exist, or the ` +
              'target does not take this kind: a breakout holds strands, a strand holds blocks, ' +
              'and a breakout itself only ever sits at day level. ' +
              'Read the day again with get_workshop.',
          )
        }

        await record('module.move', workshopId, { moduleId, toParentId: clusterId })
        return ok('Moved.', { id: moduleId, contentVersion: contentVersion.toString() })
      }),
  )

  server.registerTool(
    'delete_module',
    {
      title: 'Delete a block',
      description:
        'Deletes a block for good. Deleting a section deletes the blocks inside it; deleting a ' +
        'breakout deletes its strands and everything in them.',
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
}
