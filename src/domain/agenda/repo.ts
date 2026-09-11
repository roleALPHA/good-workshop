import { uuidv7 } from 'uuidv7'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import { cluster, moduleType, workshopDay, workshopModule } from '@/server/db/schema'
import type { CategoryColor } from '@/lib/category-colors'
import type { ClusterDto, DayDoc, ModuleDto, ModuleTypeDto } from './types'
import { bumpContentVersion, NotFoundError, type WorkshopAccess } from './access'
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

/**
 * The other half of the access check.
 *
 * `WorkshopAccess` proves that a permission was verified. It does not prove
 * that the row about to be written belongs to the workshop it was verified for
 * -- and every mutation below used to address its row by primary key alone.
 * RLS does not help here: both workshops sit in the same tenant, which is the
 * normal case and the entire point of a tenant.
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

  if (!rows[0]) throw new NotFoundError('Workshoptag nicht gefunden.')
}

/**
 * Not-found rather than forbidden, deliberately: telling a caller that an id
 * exists but belongs to somebody else is itself an answer they had no right to.
 */
function assertTouched(rowCount: number | undefined, what: string): void {
  if (!rowCount) throw new NotFoundError(`${what} nicht gefunden.`)
}

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
            jsonSchema: t.jsonSchema,
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
 * Two composite FKs back this up in the database, so a bug here is caught
 * rather than written: (tenant_id, cluster_id, day_id) keeps a module's cluster
 * on the module's own day, and (tenant_id, workshop_id, day_id) keeps the day
 * inside the workshop. The second one was missing for a long time while this
 * comment claimed both -- which is why the checks below are explicit anyway.
 */
export async function moveModule(
  tx: Tx,
  access: WorkshopAccess,
  moduleId: string,
  target: MoveTarget,
  afterId: string | null,
  expectedVersion?: bigint,
): Promise<bigint> {
  await assertDayInWorkshop(tx, access, target.dayId)

  const siblings = await siblingsOf(tx, target)
  const placement = placeAfter(
    siblings.filter((s) => s.id !== moduleId),
    afterId,
  )

  let position = placement.position
  if (placement.rebalance) {
    position = await applyRebalance(tx, placement.rebalance)
  }

  const moved = await tx
    .update(workshopModule)
    .set({
      dayId: target.dayId,
      clusterId: target.clusterId,
      position,
      updatedAt: sql`now()`,
      updatedBy: access.actor.memberId,
    })
    .where(and(eq(workshopModule.id, moduleId), eq(workshopModule.workshopId, access.workshopId)))
    .returning({ id: workshopModule.id })

  assertTouched(moved.length, 'Modul')
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
  await assertDayInWorkshop(tx, access, dayId)

  const siblings = await siblingsOf(tx, { dayId, clusterId: null })
  const placement = placeAfter(
    siblings.filter((s) => s.id !== clusterId),
    afterId,
  )

  let position = placement.position
  if (placement.rebalance) {
    position = await applyRebalance(tx, placement.rebalance)
  }

  const moved = await tx
    .update(cluster)
    .set({ dayId, position, updatedAt: sql`now()` })
    .where(and(eq(cluster.id, clusterId), eq(cluster.workshopId, access.workshopId)))
    .returning({ id: cluster.id })

  assertTouched(moved.length, 'Cluster')
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
  await assertDayInWorkshop(tx, access, input.dayId)

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

export type NewCluster = {
  dayId: string
  title: string
  color?: string | null
  afterId?: string | null
}

export async function addCluster(
  tx: Tx,
  access: WorkshopAccess,
  input: NewCluster,
  expectedVersion?: bigint,
): Promise<{ id: string; contentVersion: bigint }> {
  await assertDayInWorkshop(tx, access, input.dayId)

  const siblings = await siblingsOf(tx, { dayId: input.dayId, clusterId: null })
  const placement =
    input.afterId === undefined
      ? { position: keyAtEnd(siblings), rebalance: null }
      : placeAfter(siblings, input.afterId)

  const position = placement.rebalance
    ? await applyRebalance(tx, placement.rebalance)
    : placement.position

  const id = uuidv7()
  await tx.insert(cluster).values({
    id,
    workshopId: access.workshopId,
    dayId: input.dayId,
    title: input.title,
    color: input.color ?? null,
    position,
  })

  return { id, contentVersion: await bumpContentVersion(tx, access, expectedVersion) }
}

/**
 * Writes a whole day in one transaction.
 *
 * The single most important entry point for an LLM client. Twenty sequential,
 * dependent tool calls is where models fall apart -- they lose ids, drift on
 * ordering, and half-apply on failure, leaving an agenda that is worse than
 * before. One declarative write is all-or-nothing: either the day looks like
 * what was asked for, or nothing changed.
 *
 * `replace` clears the day first. That is destructive by design and named so.
 */
export type AgendaItem =
  | { kind: 'cluster'; title: string; color?: string | null; children?: AgendaModule[] }
  | ({ kind: 'module' } & AgendaModule)

export type AgendaModule = {
  typeKey: string
  title?: string
  durationMinutes?: number
  pinnedStartMinute?: number | null
  desc?: Record<string, unknown>
}

export async function applyAgenda(
  tx: Tx,
  access: WorkshopAccess,
  dayId: string,
  mode: 'replace' | 'append',
  items: AgendaItem[],
  expectedVersion?: bigint,
): Promise<{ created: number; contentVersion: bigint }> {
  // Before anything else, and especially before the delete below. This is the
  // single most destructive call in the codebase: `replace` empties a day, and
  // it is reachable from MCP, where the day id is simply an argument. Checking
  // it here rather than at the callers means a future tool cannot forget.
  await assertDayInWorkshop(tx, access, dayId)

  if (mode === 'replace') {
    await tx.delete(workshopModule).where(eq(workshopModule.dayId, dayId))
    await tx.delete(cluster).where(eq(cluster.dayId, dayId))
  }

  const types = await tx
    .select({
      id: moduleType.id,
      key: moduleType.key,
      duration: moduleType.defaultDurationMinutes,
      name: moduleType.name,
    })
    .from(moduleType)
  const byKey = new Map(types.map((t) => [t.key, t]))

  let created = 0
  let lastDayLevelId: string | null = null

  for (const item of items) {
    if (item.kind === 'cluster') {
      const { id } = await addCluster(tx, access, {
        dayId,
        title: item.title,
        color: item.color ?? null,
        afterId: lastDayLevelId,
      })
      lastDayLevelId = id
      created++

      let lastChildId: string | null = null
      for (const child of item.children ?? []) {
        lastChildId = await insertModule(tx, access, byKey, dayId, id, child, lastChildId)
        created++
      }
      continue
    }

    lastDayLevelId = await insertModule(tx, access, byKey, dayId, null, item, lastDayLevelId)
    created++
  }

  return { created, contentVersion: await bumpContentVersion(tx, access, expectedVersion) }
}

async function insertModule(
  tx: Tx,
  access: WorkshopAccess,
  byKey: Map<string, { id: string; duration: number; name: string }>,
  dayId: string,
  clusterId: string | null,
  input: AgendaModule,
  afterId: string | null,
): Promise<string> {
  const type = byKey.get(input.typeKey)
  if (!type) {
    // Named, with the alternatives, so a model can fix its next call rather
    // than guess again.
    throw new Error(
      `Unbekannter Modultyp "${input.typeKey}". Verfügbar: ${[...byKey.keys()].join(', ')}`,
    )
  }

  const { id } = await addModule(tx, access, {
    dayId,
    clusterId,
    moduleTypeId: type.id,
    title: input.title ?? type.name,
    durationMinutes: input.durationMinutes ?? type.duration,
    desc: input.desc,
    afterId,
  })

  if (input.pinnedStartMinute !== undefined && input.pinnedStartMinute !== null) {
    await tx
      .update(workshopModule)
      .set({ pinnedStartTime: minutesToTime(input.pinnedStartMinute) })
      .where(eq(workshopModule.id, id))
  }

  return id
}

const minutesToTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`

export async function deleteModule(
  tx: Tx,
  access: WorkshopAccess,
  moduleId: string,
  expectedVersion?: bigint,
): Promise<bigint> {
  const deleted = await tx
    .delete(workshopModule)
    .where(and(eq(workshopModule.id, moduleId), eq(workshopModule.workshopId, access.workshopId)))
    .returning({ id: workshopModule.id })

  assertTouched(deleted.length, 'Modul')
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
