import { uuidv7 } from 'uuidv7'
import { catalog } from '@gw/catalog'
import { NotFoundError, assertWorkshopAccess } from '@/domain/agenda/access'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import { addClusterBlock, addModuleBlock, patchBlock, setDayFields } from '@/domain/collab/ops'
import { validateModuleDesc } from '@/domain/moduleType/validate'
import { seedBuiltinModuleTypes } from '@/domain/moduleType/seed'
import { createDay } from '@/domain/workshop/days'
import { createWorkshop } from '@/domain/workshop/repo'
import { markdownToRichText } from '@/lib/richtext/markdown'
import { withTenant, type Actor, type Tx } from '@/server/db'
import { auditEvent, moduleType } from '@/server/db/schema'
import type { RoomEditor } from '@/server/collab/across-days'
import { blockMarkdown } from './block-prose'
import type { EntryBlock, EntryDetail } from './ports'
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
  /** A workshop of its own, named after the entry unless somebody says otherwise. */
  | { kind: 'new'; title?: string; folderId?: string | null }
  /** The entry's days, behind the last day of a workshop that exists. */
  | { kind: 'append'; workshopId: string }
  /**
   * Into a day somebody already has.
   *
   * Only for a one-day entry -- a building block. Writing a three-day Open
   * Space into one day would silently lose its day structure, so it is refused
   * rather than flattened.
   *
   * Unlike the other two this names a day that is in use, which is why the day
   * is checked against the workshop and why its own fields are never touched.
   */
  | { kind: 'day'; workshopId: string; dayId: string }

export type AdoptResult = {
  workshopId: string
  /** The days written into: the ones created, or the single one chosen. */
  dayIds: string[]
  /** Blocks that arrived as themselves. */
  written: number
  /** Blocks whose type this workspace does not have, which arrived as notes. */
  degraded: number
  /** Blocks whose fields or description this workspace's schema refused. */
  descsDropped: number
  /** Days whose room could not be written. The days exist and are empty. */
  daysFailed: number
}

/** What a block falls back to when its own type is nowhere to be found. */
const FALLBACK_TYPE_KEY = 'note'

type ResolvedType = { id: string; schemaVersion: number; jsonSchema: unknown }

export async function adoptEntry(
  actor: Actor,
  openRooms: (workshopId: string) => RoomEditor,
  input: { entryId: string; locale: Locale; target: AdoptTarget },
): Promise<AdoptResult> {
  const entry = await catalog.getEntry(input.entryId, input.locale)
  if (!entry) throw new NotFoundError()

  const intoOneDay = input.target.kind === 'day'
  if (intoOneDay && entry.days.length !== 1) {
    // See AdoptTarget: flattening is worse than refusing, and the screens only
    // offer this target for a one-day entry anyway.
    throw new NotFoundError()
  }

  // ── Phase 1: the container. One short transaction, and it ends here. ──────
  const { workshopId, dayIds, types } = await withTenant(actor, async (tx) => {
    const types = await resolveTypes(tx, actor, typeKeysOf(entry))

    const created =
      input.target.kind === 'new'
        ? await createWorkshop(tx, actor, {
            title: input.target.title?.trim() || entry.name,
            folderId: input.target.folderId ?? null,
          })
        : { workshopId: input.target.workshopId, dayId: null }

    const access = await assertWorkshopAccess(
      tx,
      actor,
      created.workshopId,
      'workshop.content.write',
    )

    let dayIds: string[]
    if (input.target.kind === 'day') {
      // `WorkshopAccess` proves a permission, not that this day belongs to that
      // workshop -- and both may sit in the same tenant, so RLS does not help.
      // Without this check the only gate left is the room's handshake, which
      // refuses a foreign day as an UNAVAILABLE SERVICE rather than a missing
      // one: somebody who picked the wrong day would be told the collaboration
      // server is down.
      await assertDayInWorkshop(tx, access, input.target.dayId)
      dayIds = [input.target.dayId]
    } else {
      // createWorkshop already made the first day; an append makes all of them.
      dayIds = created.dayId ? [created.dayId] : []
      while (dayIds.length < entry.days.length) {
        const { dayId } = await createDay(tx, access, {
          title: entry.days[dayIds.length]?.title ?? '',
        })
        dayIds.push(dayId)
      }
    }

    await tx.insert(auditEvent).values({
      actorMemberId: actor.memberId,
      source: actor.source === 'mcp' ? 'mcp' : 'web',
      entityType: 'workshop',
      entityId: created.workshopId,
      action: 'catalog.adopt',
      data: { entryId: entry.id, days: dayIds.length },
    })

    return { workshopId: created.workshopId, dayIds, types }
  })

  // ── Phase 2: the blocks, one room per day, outside any transaction. ───────
  const rooms = openRooms(workshopId)
  const tally = { written: 0, degraded: 0, descsDropped: 0, daysFailed: 0 }

  for (const [index, day] of entry.days.entries()) {
    const dayId = dayIds[index]
    if (!dayId) continue
    try {
      await rooms(dayId, (doc) => {
        doc.transact(() => {
          // NEVER for a day that was already there. `setDayFields` writes every
          // key that is not undefined, so it would overwrite the title and the
          // start minute of a day somebody is using -- and because pins resolve
          // against their own day's start, every pinned block would jump while
          // the unpinned ones stood still.
          if (!intoOneDay) {
            setDayFields(doc, { title: day.title, startMinute: day.startMinute })
          }
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
    } catch (error) {
      // A multi-day entry counts the lost day and carries on: the other days
      // did arrive, and deleting the workshop would throw away what did. One
      // day has no other days -- swallowing that would return a success with
      // nothing written, and the panel would offer to open a workshop where
      // nothing happened.
      if (intoOneDay) throw error
      tally.daysFailed += 1
    }
  }

  return { workshopId, dayIds, ...tally }
}

/** Every block type an entry asks for, clusters flattened. */
function typeKeysOf(entry: EntryDetail): Set<string> {
  return new Set(
    entry.days
      .flatMap((day) =>
        day.items.flatMap((item) => (item.kind === 'cluster' ? item.children : [item])),
      )
      .map((block) => block.moduleTypeKey),
  )
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
  wanted: Iterable<string>,
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
  if ([...wanted].some((key) => !types.has(key))) {
    await seedBuiltinModuleTypes(tx, actor.tenantId)
    types = await read()
  }
  return types
}

function write(
  doc: Parameters<typeof addModuleBlock>[0],
  block: EntryBlock,
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
  if ((block.description || Object.keys(block.fields).length > 0) && desc === undefined) {
    tally.descsDropped += 1
  }

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
 * What the block arrives filled in with.
 *
 * TWO SOURCES, AND THE ORDER MATTERS. `fields` is what the catalogue authored
 * into the block type's own fields -- `prompt`, `materials`, `participation`,
 * `timebox_per_person_seconds`. That is the thing this whole rebuild existed
 * to make possible: before it, a catalogue entry had nowhere to put them, and
 * the prose meant for the public page was dumped into the one free-text field
 * instead, which is not a method arriving in an agenda but an advertisement.
 *
 * `description` is still honoured, as Markdown converted to rich text, because
 * a block may carry a sentence that belongs nowhere else. It does not overwrite
 * a `description` the authored fields already set.
 *
 * Validated against the ADOPTING tenant's schema and not the catalogue's: a
 * workspace may have customised the built-in, and what its schema refuses
 * arrives empty and counted rather than failing the block. Undefined means
 * "nothing to store", which is also what an empty description means.
 */
function descFor(block: EntryBlock, type: ResolvedType): Record<string, unknown> | undefined {
  const written = block.description.trim()
    ? { description: markdownToRichText(blockMarkdown(block.description)) }
    : {}
  const desc = { ...written, ...block.fields }
  if (Object.keys(desc).length === 0) return undefined
  return validateModuleDesc(type, desc).ok ? desc : undefined
}
