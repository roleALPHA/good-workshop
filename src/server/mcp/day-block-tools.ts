import { z } from 'zod'
import { uuidv7 } from 'uuidv7'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { NotFoundError } from '@/domain/agenda/access'
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
}
