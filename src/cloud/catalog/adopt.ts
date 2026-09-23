import { uuidv7 } from 'uuidv7'
import { catalog } from '@gw/catalog'
import { NotFoundError, assertWorkshopAccess } from '@/domain/agenda/access'
import { addClusterBlock, addModuleBlock, patchBlock, setDayFields } from '@/domain/collab/ops'
import { validateModuleDesc } from '@/domain/moduleType/validate'
import { seedBuiltinModuleTypes } from '@/domain/moduleType/seed'
import { createDay } from '@/domain/workshop/days'
import { createWorkshop } from '@/domain/workshop/repo'
import { markdownToRichText } from '@/lib/richtext/markdown'
import { withTenant, type Actor, type Tx } from '@/server/db'
import { auditEvent, moduleType } from '@/server/db/schema'
import type { RoomEditor } from '@/server/collab/across-days'
import type { DesignBlock, DesignDetail } from './ports'
import type { Locale } from '@/i18n/config'

/**
 * A design from the catalogue, written into somebody's workshops.
 *
 * The most dangerous code in this feature, and the reason it lives in the
 * public repository rather than beside the catalogue it reads: it writes into
 * tenant data through the collaboration room, and it belongs where
 * `pnpm test:db` and the E2E suite reach it. The port says WHAT is adopted;
 * this decides HOW it is written.
 *
 * THREE THINGS THAT LOOK LIKE DETAILS AND ARE NOT:
 *
 * 1. Two phases, and the transaction ENDS before the first room opens.
 *    src/server/collab/across-days.ts states it outright: materialising takes
 *    the workshop row's lock, so a room opened while a transaction holds it
 *    waits for a transaction that is waiting for the room.
 *
 * 2. Blocks go through the room, never straight into the tables.
 *    src/server/collab/materialize.ts deletes every row of a day its document
 *    does not hold. A relational write into a day somebody has open is gone at
 *    the next flush, with nothing to show for it. (This is also why
 *    `applyAgenda` in domain/agenda/repo.ts stayed unused and was deleted.)
 *
 * 3. Block types are resolved BY KEY against the adopting tenant.
 *    `module.module_type_id` is a composite foreign key including tenant_id,
 *    and every workspace has its own rows. An id carried over from the
 *    catalogue would name a row in somebody else's tenant.
 *
 * It never refuses a whole design over one block. That is the opposite of
 * `apply_agenda`, deliberately: there the caller can fix its input, here the
 * caller cannot fix the catalogue. A method whose block type this workspace
 * does not have arrives as a note, a description its schema rejects arrives
 * empty, and both are counted and reported rather than swallowed.
 */

export type AdoptTarget =
  { kind: 'new'; title?: string; folderId?: string | null } | { kind: 'append'; workshopId: string }

export type AdoptResult = {
  workshopId: string
  dayIds: string[]
  /** Blocks that arrived as themselves. */
  written: number
  /** Blocks whose method needs a block type this workspace does not have. */
  degraded: number
  /** Blocks whose description this workspace's schema refused. */
  descsDropped: number
  /** Days whose room could not be written. The days exist and are empty. */
  daysFailed: number
}

/** What a block falls back to when its own type is nowhere to be found. */
const FALLBACK_TYPE_KEY = 'note'

type ResolvedType = { id: string; schemaVersion: number; jsonSchema: unknown }

export async function adoptDesign(
  actor: Actor,
  openRooms: (workshopId: string) => RoomEditor,
  input: { designId: string; locale: Locale; target: AdoptTarget },
): Promise<AdoptResult> {
  const design = await catalog.getDesign(input.designId, input.locale)
  if (!design) throw new NotFoundError()

  // ── Phase 1: the container. One short transaction, and it ends here. ──────
  const { workshopId, dayIds, types } = await withTenant(actor, async (tx) => {
    const types = await resolveTypes(tx, actor, design)

    const created =
      input.target.kind === 'new'
        ? await createWorkshop(tx, actor, {
            title: input.target.title?.trim() || design.name,
            folderId: input.target.folderId ?? null,
          })
        : { workshopId: input.target.workshopId, dayId: null }

    if (input.target.kind === 'append') {
      await assertWorkshopAccess(tx, actor, input.target.workshopId, 'workshop.content.write')
    }

    const access = await assertWorkshopAccess(
      tx,
      actor,
      created.workshopId,
      'workshop.content.write',
    )

    // createWorkshop already made the first day; an append makes all of them.
    const dayIds: string[] = created.dayId ? [created.dayId] : []
    while (dayIds.length < design.days.length) {
      const { dayId } = await createDay(tx, access, {
        title: design.days[dayIds.length]?.title ?? '',
      })
      dayIds.push(dayId)
    }

    await tx.insert(auditEvent).values({
      actorMemberId: actor.memberId,
      source: actor.source === 'mcp' ? 'mcp' : 'web',
      entityType: 'workshop',
      entityId: created.workshopId,
      action: 'catalog.adopt',
      data: { designId: design.id, days: dayIds.length },
    })

    return { workshopId: created.workshopId, dayIds, types }
  })

  // ── Phase 2: the blocks, one room per day, outside any transaction. ───────
  const rooms = openRooms(workshopId)
  const tally = { written: 0, degraded: 0, descsDropped: 0, daysFailed: 0 }

  for (const [index, day] of design.days.entries()) {
    const dayId = dayIds[index]
    if (!dayId) continue
    try {
      await rooms(dayId, (doc) => {
        doc.transact(() => {
          setDayFields(doc, { title: day.title, startMinute: day.startMinute })
          for (const item of day.items) {
            if (item.kind === 'cluster') {
              const clusterId = uuidv7()
              addClusterBlock(doc, clusterId, { title: item.title, color: item.color })
              // A cluster's pin is not part of creating one, so it is patched
              // on: NewClusterBlock carries a title and a colour and nothing
              // else, and inventing a field there would touch every caller.
              if (item.pinnedStartMinute !== null) {
                patchBlock(doc, clusterId, { pinnedStartMinute: item.pinnedStartMinute })
              }
              for (const child of item.children) {
                write(doc, child, clusterId, types, tally)
              }
              continue
            }
            write(doc, item, null, types, tally)
          }
        })
      })
    } catch {
      // The days already written stay. Deleting the workshop would throw away
      // what did arrive -- the same trade across-days.ts makes when a block
      // crosses days and the second half fails.
      tally.daysFailed += 1
    }
  }

  return { workshopId, dayIds, ...tally }
}

/**
 * The block types this workspace has, by key, with the built-ins seeded first.
 *
 * Seeding is idempotent (`on conflict do nothing`) and costs nothing when they
 * are already there. It fixes the real case for free: a workspace created
 * before a built-in existed, which would otherwise lose every block of that
 * type to the fallback.
 */
async function resolveTypes(
  tx: Tx,
  actor: Actor,
  design: DesignDetail,
): Promise<Map<string, ResolvedType>> {
  const read = async () => {
    const rows = await tx
      .select({
        key: moduleType.key,
        id: moduleType.id,
        schemaVersion: moduleType.schemaVersion,
        jsonSchema: moduleType.jsonSchema,
      })
      .from(moduleType)
    return new Map(rows.map((row) => [row.key, row]))
  }

  let types = await read()
  const wanted = new Set(
    design.days
      .flatMap((day) =>
        day.items.flatMap((item) => (item.kind === 'cluster' ? item.children : [item])),
      )
      .map((block) => block.moduleTypeKey),
  )
  if ([...wanted].some((key) => !types.has(key))) {
    await seedBuiltinModuleTypes(tx, actor.tenantId)
    types = await read()
  }
  return types
}

function write(
  doc: Parameters<typeof addModuleBlock>[0],
  block: DesignBlock,
  parentId: string | null,
  types: Map<string, ResolvedType>,
  tally: { written: number; degraded: number; descsDropped: number },
): void {
  const own = types.get(block.moduleTypeKey)
  const type = own ?? types.get(FALLBACK_TYPE_KEY)
  // Not even a note: this workspace has no block types at all, which is a
  // broken workspace rather than a design worth degrading for.
  if (!type) return

  if (!own) tally.degraded += 1

  const desc = descFor(block, type)
  if (block.description && desc === undefined) tally.descsDropped += 1

  addModuleBlock(doc, uuidv7(), {
    moduleTypeId: type.id,
    title: block.title,
    durationMinutes: block.durationMinutes,
    pinnedStartMinute: block.pinnedStartMinute,
    parked: block.parked,
    parentId,
    ...(desc ? { desc } : {}),
  })
  tally.written += 1
}

/**
 * The catalogue writes Markdown; a block stores a rich-text document.
 *
 * Validated against the ADOPTING tenant's schema, not the catalogue's: a
 * workspace may have customised the built-in, and a description its schema
 * refuses arrives empty and counted rather than failing the block. Undefined
 * means "nothing to store", which is also what an empty description means.
 */
function descFor(block: DesignBlock, type: ResolvedType): Record<string, unknown> | undefined {
  if (!block.description.trim()) return undefined
  const desc = { description: markdownToRichText(block.description) }
  return validateModuleDesc(type, desc).ok ? desc : undefined
}
