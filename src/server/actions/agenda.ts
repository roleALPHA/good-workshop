'use server'

import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { bumpContentVersion } from '@/domain/agenda/access'
import { addModule, deleteModule, loadDay, moveCluster, moveModule } from '@/domain/agenda/repo'
import { validateModuleDesc } from '@/domain/moduleType/validate'
import { moduleType, workshopModule } from '@/server/db/schema'
import { workshopAction, type ActionResult } from './context'

/**
 * Agenda mutations.
 *
 * Each one carries an optional `expectedVersion`. That is the compare-and-swap
 * that stops a client working from a stale read -- another tab, an MCP client,
 * a colleague -- from silently overwriting live edits. Without it the failure
 * gets reported as "the AI deleted my workshop", which is both terrible and
 * accurate.
 */

const Version = z.string().regex(/^\d+$/).optional()
const asVersion = (value?: string) => (value === undefined ? undefined : BigInt(value))

const Workshop = z.string().uuid()

export async function loadDayAction(raw: { workshopId: string; dayId: string }) {
  return workshopAction(
    z.object({ workshopId: Workshop, dayId: z.string().uuid() }),
    raw,
    'workshop.read',
    async (tx, access, input) => {
      const { doc, contentVersion } = await loadDay(tx, access, input.dayId)
      // bigint does not survive the boundary to the client; the version is a
      // token to hand back, not a number to compute with.
      return { doc, contentVersion: contentVersion.toString() }
    },
  )
}

export async function moveModuleAction(raw: {
  workshopId: string
  moduleId: string
  dayId: string
  clusterId: string | null
  afterId: string | null
  expectedVersion?: string
}): Promise<ActionResult<{ contentVersion: string }>> {
  return workshopAction(
    z.object({
      workshopId: Workshop,
      moduleId: z.string().uuid(),
      dayId: z.string().uuid(),
      clusterId: z.string().uuid().nullable(),
      // Anchor-based: if a sibling moved concurrently we still land after the
      // right neighbour rather than at a stale index.
      afterId: z.string().uuid().nullable(),
      expectedVersion: Version,
    }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => ({
      contentVersion: (
        await moveModule(
          tx,
          access,
          input.moduleId,
          { dayId: input.dayId, clusterId: input.clusterId },
          input.afterId,
          asVersion(input.expectedVersion),
        )
      ).toString(),
    }),
  )
}

export async function moveClusterAction(raw: {
  workshopId: string
  clusterId: string
  dayId: string
  afterId: string | null
  expectedVersion?: string
}): Promise<ActionResult<{ contentVersion: string }>> {
  return workshopAction(
    z.object({
      workshopId: Workshop,
      clusterId: z.string().uuid(),
      dayId: z.string().uuid(),
      afterId: z.string().uuid().nullable(),
      expectedVersion: Version,
    }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => ({
      contentVersion: (
        await moveCluster(
          tx,
          access,
          input.clusterId,
          input.dayId,
          input.afterId,
          asVersion(input.expectedVersion),
        )
      ).toString(),
    }),
  )
}

export async function addModuleAction(raw: {
  workshopId: string
  dayId: string
  clusterId: string | null
  typeKey: string
  title?: string
  expectedVersion?: string
}): Promise<ActionResult<{ id: string; contentVersion: string }>> {
  return workshopAction(
    z.object({
      workshopId: Workshop,
      dayId: z.string().uuid(),
      clusterId: z.string().uuid().nullable(),
      typeKey: z.string().min(1),
      title: z.string().trim().max(300).optional(),
      expectedVersion: Version,
    }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => {
      const types = await tx
        .select({ id: moduleType.id, name: moduleType.name })
        .from(moduleType)
        .where(eq(moduleType.key, input.typeKey))
        .limit(1)
      const type = types[0]
      if (!type) throw new Error(`Unbekannter Modultyp: ${input.typeKey}`)

      const created = await addModule(
        tx,
        access,
        {
          dayId: input.dayId,
          clusterId: input.clusterId,
          moduleTypeId: type.id,
          title: input.title ?? type.name,
        },
        asVersion(input.expectedVersion),
      )
      return { id: created.id, contentVersion: created.contentVersion.toString() }
    },
  )
}

export async function deleteModuleAction(raw: {
  workshopId: string
  moduleId: string
  expectedVersion?: string
}): Promise<ActionResult<{ contentVersion: string }>> {
  return workshopAction(
    z.object({
      workshopId: Workshop,
      moduleId: z.string().uuid(),
      expectedVersion: Version,
    }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => ({
      contentVersion: (
        await deleteModule(tx, access, input.moduleId, asVersion(input.expectedVersion))
      ).toString(),
    }),
  )
}

/**
 * Field edits, one field at a time.
 *
 * Per-field rather than per-row on purpose: two people editing the title and
 * the duration of the same block must not collide. Whole-row writes would make
 * that a conflict for no reason.
 */
export async function patchModuleAction(raw: {
  workshopId: string
  moduleId: string
  title?: string
  durationMinutes?: number
  pinnedStartMinute?: number | null
  desc?: Record<string, unknown>
  expectedVersion?: string
}): Promise<ActionResult<{ contentVersion: string }>> {
  return workshopAction(
    z.object({
      workshopId: Workshop,
      moduleId: z.string().uuid(),
      title: z.string().trim().max(300).optional(),
      durationMinutes: z.number().int().min(0).max(1440).optional(),
      pinnedStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
      desc: z.record(z.string(), z.unknown()).optional(),
      expectedVersion: Version,
    }),
    raw,
    'workshop.content.write',
    async (tx, access, input) => {
      const patch: Record<string, unknown> = {}
      if (input.title !== undefined) patch.title = input.title
      if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes
      if (input.pinnedStartMinute !== undefined) {
        patch.pinnedStartTime =
          input.pinnedStartMinute === null ? null : minutesToTime(input.pinnedStartMinute)
      }

      if (input.desc !== undefined) {
        // Re-validated here unconditionally. The editor runs the same check for
        // instant feedback, but a client-side check is a courtesy and never a
        // guarantee -- this call is reachable without the editor.
        const rows = await tx
          .select({
            id: moduleType.id,
            schemaVersion: moduleType.schemaVersion,
            jsonSchema: moduleType.jsonSchema,
          })
          .from(moduleType)
          .innerJoin(workshopModule, eq(workshopModule.moduleTypeId, moduleType.id))
          .where(eq(workshopModule.id, input.moduleId))
          .limit(1)

        const type = rows[0]
        if (!type) throw new Error('Modul nicht gefunden.')

        const validated = validateModuleDesc(type, input.desc)
        if (!validated.ok) {
          throw new Error(
            `Ungültige Angaben: ${validated.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
          )
        }
        patch.jsonDesc = validated.value
      }

      if (Object.keys(patch).length > 0) {
        await tx
          .update(workshopModule)
          .set({ ...patch, updatedAt: sql`now()`, updatedBy: access.actor.memberId })
          .where(eq(workshopModule.id, input.moduleId))
      }

      return {
        contentVersion: (
          await bumpContentVersion(tx, access, asVersion(input.expectedVersion))
        ).toString(),
      }
    },
  )
}

const minutesToTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`
