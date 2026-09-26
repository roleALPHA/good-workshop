import { and, asc, eq } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import { cluster, moduleType, workshopDay, workshopModule } from '@/server/db/schema'
import type { CategoryColor } from '@/lib/category-colors'
import type { ClusterDto, DayDoc, ModuleDto, ModuleTypeDto } from './types'
import { NotFoundError, type WorkshopAccess } from './access'
import { sortByPosition } from './ordering'
import { normalizeResponsible } from './responsible'
import type { Locale } from '@/i18n/config'
import { localiseModuleType } from '@/domain/moduleType/localise'

/**
 * Reads a day out of the tables.
 *
 * This module used to write them too, and no longer does: the collaboration
 * room owns every mutation, and the materialiser is the one writer left. The
 * mutations that stood here were a second write path that nothing called any
 * more -- see `../../server/collab/write-path.test.ts`, which now keeps it that
 * way.
 *
 * What remains is the read the room, the pages, the export and MCP all share.
 * The two tables `cluster` and `module` are deliberately separate -- that is
 * the stated domain model -- which means the read has to merge them, and doing
 * that in one place is what would make a later collapse into a single
 * `agenda_item` table a migration plus one file rather than a rewrite.
 */

export type DayDocResult = { doc: DayDoc; contentVersion: bigint }

/**
 * The other half of the access check.
 *
 * `WorkshopAccess` proves that a permission was verified. It does not prove
 * that the day about to be read or written belongs to the workshop it was
 * verified for -- and a caller addressing its row by primary key alone has no
 * way to tell. RLS does not help here: both workshops sit in the same tenant,
 * which is the normal case and the entire point of a tenant.
 *
 * Ids are not a secret to ration. A viewer reads them out of the page, an
 * export carries them, MCP hands them out. Treating them as unguessable is the
 * assumption these helpers exist to remove.
 */
export async function assertDayInWorkshop(
  tx: Tx,
  access: WorkshopAccess,
  dayId: string,
): Promise<void> {
  const rows = await tx
    .select({ id: workshopDay.id })
    .from(workshopDay)
    .where(and(eq(workshopDay.id, dayId), eq(workshopDay.workshopId, access.workshopId)))
    .limit(1)

  // Not-found rather than forbidden, deliberately: telling a caller that an id
  // exists but belongs to somebody else is itself an answer they had no right to.
  if (!rows[0]) throw new NotFoundError()
}

/**
 * @param locale which language the block types are named in.
 *
 * A parameter rather than something read from the request, and that is
 * load-bearing: an export is often handed to somebody other than the person
 * producing it, and MCP has no viewer at all. Each of the six callers decides
 * for itself -- the app page and the collaboration room take the session's
 * language, the export route takes `?locale` if there is one, MCP answers in
 * English.
 */
export async function loadDay(
  tx: Tx,
  access: WorkshopAccess,
  dayId: string,
  locale: Locale,
): Promise<DayDocResult> {
  const days = await tx
    .select()
    .from(workshopDay)
    .where(and(eq(workshopDay.id, dayId), eq(workshopDay.workshopId, access.workshopId)))
    .limit(1)

  const day = days[0]
  if (!day) throw new NotFoundError()

  const [clusters, modules, types] = await Promise.all([
    tx.select().from(cluster).where(eq(cluster.dayId, dayId)).orderBy(asc(cluster.position)),
    tx.select().from(workshopModule).where(eq(workshopModule.dayId, dayId)),
    tx.select().from(moduleType).where(eq(moduleType.isActive, true)),
  ])

  // Ordinals are projected here and the fractional keys stay behind. Clients --
  // and especially LLM clients -- get 0, 1, 2.
  const dayLevel = sortByPosition([
    ...clusters.map((c) => ({ id: c.id, position: c.position })),
    ...modules.filter((m) => m.clusterId === null).map((m) => ({ id: m.id, position: m.position })),
  ])
  const dayOrder = new Map(dayLevel.map((row, index) => [row.id, index]))

  const childOrder = new Map<string, number>()
  for (const c of clusters) {
    const children = sortByPosition(
      modules.filter((m) => m.clusterId === c.id).map((m) => ({ id: m.id, position: m.position })),
    )
    children.forEach((child, index) => childOrder.set(child.id, index))
  }

  return {
    contentVersion: access.contentVersion,
    doc: {
      id: day.id,
      workshopId: day.workshopId,
      title: day.title,
      date: day.date,
      startMinute: timeToMinutes(day.startTime),
      targetEndMinute: day.targetEndTime ? timeToMinutes(day.targetEndTime) : null,
      desc: (day.jsonDesc as Record<string, unknown>) ?? {},
      clusters: clusters.map((c): ClusterDto => ({
        id: c.id,
        title: c.title,
        color: (c.color as CategoryColor | null) ?? null,
        pinnedStartMinute: c.pinnedStartTime ? timeToMinutes(c.pinnedStartTime) : null,
        collapsed: c.collapsed,
        targetDurationMinutes: c.targetDurationMinutes,
        order: dayOrder.get(c.id) ?? 0,
      })),
      modules: modules.map((m): ModuleDto => ({
        id: m.id,
        clusterId: m.clusterId,
        moduleTypeId: m.moduleTypeId,
        title: m.title,
        durationMinutes: m.durationMinutes,
        pinnedStartMinute: m.pinnedStartTime ? timeToMinutes(m.pinnedStartTime) : null,
        desc: m.jsonDesc as Record<string, unknown>,
        parked: m.parked,
        responsible: normalizeResponsible(m.responsible),
        order: (m.clusterId === null ? dayOrder.get(m.id) : childOrder.get(m.id)) ?? 0,
      })),
      /**
       * The one place a stored block type becomes something a person reads.
       *
       * Everything downstream goes through this map: the inspector, the block
       * picker, the agenda table, the category legend, the Markdown exporter,
       * the print view and MCP's get_workshop. Translating here rather than at
       * any one of them is the difference between five surfaces agreeing and
       * four of them being fixed later.
       *
       * systemKey and customizedAt deliberately do NOT reach the DTO: it
       * travels to the browser and into the Yjs payload, and neither has a use
       * for them.
       */
      moduleTypes: Object.fromEntries(
        types.map((row): [string, ModuleTypeDto] => {
          const t = localiseModuleType(row, locale)
          return [
            t.id,
            {
              id: t.id,
              key: t.key,
              name: t.name,
              color: t.color as CategoryColor,
              icon: t.icon,
              defaultDurationMinutes: t.defaultDurationMinutes,
              countsAsContent: t.countsAsContent,
              jsonSchema: t.jsonSchema,
              schemaVersion: t.schemaVersion,
            },
          ]
        }),
      ),
    },
  }
}

/** `09:00:00` -> 540. The scheduler works in integer minutes throughout. */
function timeToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':')
  return Number(hours) * 60 + Number(minutes)
}
