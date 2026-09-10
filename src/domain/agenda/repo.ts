import { uuidv7 } from 'uuidv7'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import { cluster, moduleType, workshopDay, workshopModule } from '@/server/db/schema'
import type { CategoryColor } from '@/lib/category-colors'
import type { ClusterDto, DayDoc, ModuleDto, ModuleTypeDto } from './types'
import { bumpContentVersion, type WorkshopAccess } from './access'
import { keyAtEnd, placeAfter, sortByPosition } from './ordering'

/**
 * Every structural mutation to an agenda goes through here.
 *
 * The two tables `cluster` and `module` are deliberately separate -- that is
 * the stated domain model -- which means every reorder, move, duplicate and
 * export has to merge them. Routing all of it through one module is what keeps
 * that merge in one place, and what would make a later collapse into a single
 * `agenda_item` table a migration plus one file rather than a rewrite.
 *
 * Note the signatures: each mutation demands a WorkshopAccess. That token is
 * only constructible by assertWorkshopAccess, so forgetting the permission
 * check is a compile error rather than a security incident.
 */

export type DayDocResult = { doc: DayDoc; contentVersion: bigint }

export async function loadDay(
  tx: Tx,
  access: WorkshopAccess,
  dayId: string,
): Promise<DayDocResult> {
  const days = await tx
    .select()
    .from(workshopDay)
    .where(and(eq(workshopDay.id, dayId), eq(workshopDay.workshopId, access.workshopId)))
    .limit(1)

  const day = days[0]
  if (!day) throw new Error('Workshoptag nicht gefunden.')

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
        order: (m.clusterId === null ? dayOrder.get(m.id) : childOrder.get(m.id)) ?? 0,
      })),
      moduleTypes: Object.fromEntries(
        types.map((t): [string, ModuleTypeDto] => [
          t.id,
          {
            id: t.id,
            key: t.key,
            name: t.name,
            color: t.color as CategoryColor,
            icon: t.icon,
            defaultDurationMinutes: t.defaultDurationMinutes,
            countsAsContent: t.countsAsContent,
          },
        ]),
      ),
    },
  }
}

export type MoveTarget = { dayId: string; clusterId: string | null }

/**
 * Moves a module or a cluster.
 *
 * Anchor-based (`afterId`) rather than index-based: if a sibling moved
 * concurrently you still land after the right neighbour instead of at a stale
 * index. The write itself is a single row -- that is the whole reason for
 * fractional keys.
 *
 * The day-consistency composite FK does the cross-day validation in the
 * database, so moving a module into a cluster on another day fails even if this
 * function forgets to check.
 */
export async function moveModule(
  tx: Tx,
  access: WorkshopAccess,
  moduleId: string,
  target: MoveTarget,
  afterId: string | null,
  expectedVersion?: bigint,
): Promise<bigint> {
  const siblings = await siblingsOf(tx, target)
  const placement = placeAfter(
    siblings.filter((s) => s.id !== moduleId),
    afterId,
  )

  let position = placement.position
  if (placement.rebalance) {
    position = await applyRebalance(tx, placement.rebalance)
  }

  await tx
    .update(workshopModule)
    .set({
      dayId: target.dayId,
      clusterId: target.clusterId,
      position,
      updatedAt: sql`now()`,
      updatedBy: access.actor.memberId,
    })
    .where(eq(workshopModule.id, moduleId))

  return bumpContentVersion(tx, access, expectedVersion)
}

export async function moveCluster(
  tx: Tx,
  access: WorkshopAccess,
  clusterId: string,
  dayId: string,
  afterId: string | null,
  expectedVersion?: bigint,
): Promise<bigint> {
  const siblings = await siblingsOf(tx, { dayId, clusterId: null })
  const placement = placeAfter(
    siblings.filter((s) => s.id !== clusterId),
    afterId,
  )

  let position = placement.position
  if (placement.rebalance) {
    position = await applyRebalance(tx, placement.rebalance)
  }

  await tx
    .update(cluster)
    .set({ dayId, position, updatedAt: sql`now()` })
    .where(eq(cluster.id, clusterId))

  return bumpContentVersion(tx, access, expectedVersion)
}

export type NewModule = {
  dayId: string
  clusterId: string | null
  moduleTypeId: string
  title: string
  durationMinutes?: number
  desc?: Record<string, unknown>
  afterId?: string | null
}

export async function addModule(
  tx: Tx,
  access: WorkshopAccess,
  input: NewModule,
  expectedVersion?: bigint,
): Promise<{ id: string; contentVersion: bigint }> {
  const siblings = await siblingsOf(tx, { dayId: input.dayId, clusterId: input.clusterId })
  const placement =
    input.afterId === undefined
      ? { position: keyAtEnd(siblings), rebalance: null }
      : placeAfter(siblings, input.afterId)

  let position = placement.position
  if (placement.rebalance) {
    position = await applyRebalance(tx, placement.rebalance)
  }

  const types = await tx
    .select({ defaultDuration: moduleType.defaultDurationMinutes })
    .from(moduleType)
    .where(eq(moduleType.id, input.moduleTypeId))
    .limit(1)
  if (!types[0]) throw new Error('Unbekannter Modultyp.')

  // UUIDv7 so ids sort by creation time -- index locality, and the client can
  // generate one before the round trip for an optimistic row.
  const id = uuidv7()

  await tx.insert(workshopModule).values({
    id,
    workshopId: access.workshopId,
    dayId: input.dayId,
    clusterId: input.clusterId,
    moduleTypeId: input.moduleTypeId,
    title: input.title,
    durationMinutes: input.durationMinutes ?? types[0].defaultDuration,
    jsonDesc: input.desc ?? {},
    position,
    createdBy: access.actor.memberId,
    updatedBy: access.actor.memberId,
  })

  return { id, contentVersion: await bumpContentVersion(tx, access, expectedVersion) }
}

export async function deleteModule(
  tx: Tx,
  access: WorkshopAccess,
  moduleId: string,
  expectedVersion?: bigint,
): Promise<bigint> {
  await tx.delete(workshopModule).where(eq(workshopModule.id, moduleId))
  return bumpContentVersion(tx, access, expectedVersion)
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Siblings share one key space per parent. At day level that spans two tables
 * -- clusters and day-level modules interleave -- which is precisely why
 * integer positions would need a sequence shared across tables.
 */
async function siblingsOf(tx: Tx, target: MoveTarget) {
  if (target.clusterId !== null) {
    const rows = await tx
      .select({ id: workshopModule.id, position: workshopModule.position })
      .from(workshopModule)
      .where(eq(workshopModule.clusterId, target.clusterId))
    return rows
  }

  const [clusters, modules] = await Promise.all([
    tx
      .select({ id: cluster.id, position: cluster.position })
      .from(cluster)
      .where(eq(cluster.dayId, target.dayId)),
    tx
      .select({ id: workshopModule.id, position: workshopModule.position })
      .from(workshopModule)
      .where(and(eq(workshopModule.dayId, target.dayId), sql`${workshopModule.clusterId} is null`)),
  ])
  return [...clusters, ...modules]
}

/**
 * Rewrites a whole sibling list with evenly spaced keys and returns the slot
 * reserved for the moving row.
 *
 * Rare, cheap and invisible: the workshop lock is already held, and sibling
 * lists are tens of rows.
 */
async function applyRebalance(
  tx: Tx,
  rebalance: { id: string; position: string }[],
): Promise<string> {
  let reserved = ''
  for (const row of rebalance) {
    if (row.id === '') {
      reserved = row.position
      continue
    }
    await tx.update(cluster).set({ position: row.position }).where(eq(cluster.id, row.id))
    await tx
      .update(workshopModule)
      .set({ position: row.position })
      .where(eq(workshopModule.id, row.id))
  }
  return reserved
}

/** `09:00:00` -> 540. The scheduler works in integer minutes throughout. */
function timeToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':')
  return Number(hours) * 60 + Number(minutes)
}
