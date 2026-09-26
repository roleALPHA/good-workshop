import { z } from 'zod'
import type * as Y from 'yjs'
import {
  assertWorkshopAccess,
  VersionConflictError,
  type WorkshopAccess,
} from '@/domain/agenda/access'
import { ModuleDescError, validateModuleDesc } from '@/domain/moduleType/validate'
import { CATEGORY_COLORS } from '@/lib/category-colors'
import {
  MAX_RESPONSIBLE,
  MAX_RESPONSIBLE_NAME,
  normalizeResponsible,
  responsibleFromInput,
  type Responsible,
} from '@/domain/agenda/responsible'
import { listAssignable } from '@/domain/tenant/members'
import type { BlockPatch, NewModuleBlock } from '@/domain/collab/ops'
import { blocksOf } from '@/domain/collab/doc'
import { editInRoom } from '@/server/collab/client'
import { withTenant, type Tx } from '@/server/db'
import { moduleType } from '@/server/db/schema'
import { Id, auditor, type Ctx } from './shared'

/**
 * What the writing tools are made of.
 *
 * Every write to a day goes through the collaboration room rather than through
 * the repository, and that is load-bearing rather than tidy. The room's document
 * is what the materialiser writes back to the tables, deleting whatever it does
 * not hold. A tool writing to the tables directly would have its block removed
 * again a few seconds later -- silently, and only when somebody happened to have
 * the day open, which is the worst possible shape for a bug. One day has one
 * write path, and src/server/collab/write-path.test.ts keeps it that way.
 *
 * The machinery lives here rather than in each tool file because the sequence is
 * the same every time and getting it wrong is invisible: check access and the
 * version BEFORE the room is opened, look up the people the model named, edit
 * the document, record the change. Three tool files spelling that out three
 * times would drift, and the drift would be a permission check in the wrong
 * order.
 */

export const Minute = z.number().int().min(0).max(1439)
export const Duration = z.number().int().min(0).max(1440)

/**
 * Who answers for a block, as a model names them.
 *
 * A member by `memberId` (get_workshop shows the ids of people already
 * assigned) or by their exact full name, first and last; anybody else by name alone. There is
 * deliberately no tool that lists the workspace's members -- see the note on
 * members in docs/architecture.md -- so a name that matches nobody is taken to
 * be somebody from outside, which is what it most likely is.
 */
export const PeopleInput = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(MAX_RESPONSIBLE_NAME).optional(),
        memberId: Id.optional(),
      })
      .refine((entry) => entry.name !== undefined || entry.memberId !== undefined, {
        message: 'Give a name, a memberId, or both.',
      }),
  )
  .max(MAX_RESPONSIBLE)
  .describe(
    'Who is responsible for the block -- the whole list, [] clears it. Each entry is ' +
      '{ memberId } for a member of the workspace, or { name } for anybody; a name that is exactly ' +
      "a member's full name (first and last name) is linked to that member.",
  )
export type PeopleInput = z.infer<typeof PeopleInput>

/** What update_module and update_modules may change; which applies depends on the kind. */
export const UpdateFields = {
  title: z.string().trim().min(1).max(300).optional(),
  durationMinutes: Duration.optional(),
  pinnedStartMinute: Minute.nullable().optional(),
  desc: z.record(z.string(), z.unknown()).optional(),
  parked: z.boolean().optional(),
  responsible: PeopleInput.optional(),
  color: z.enum(CATEGORY_COLORS).nullable().optional(),
}
export type UpdateInput = z.infer<z.ZodObject<typeof UpdateFields>>
/** An update whose people have been looked up, ready to be written. */
export type PlannedInput = Omit<UpdateInput, 'responsible'> & { responsible?: Responsible[] }

/**
 * The four steps every writing tool takes, bound to one caller.
 *
 * A closure rather than four exported functions taking an actor: the actor and
 * the raw Authorization header belong together, and a signature that lets a
 * caller pass one without the other is a signature that invites a write into
 * the room as somebody else.
 */
/**
 * Announced as a model, not merely as a name.
 *
 * Somebody watching their agenda change under their hands is owed the difference
 * between a colleague and something a colleague pointed at their workshop.
 */
export const MODEL_PRESENCE = { name: 'KI-Assistent', hue: 292, kind: 'model' as const }

export function dayWriter({ actor, authorization }: Ctx) {
  const audit = auditor(actor, 'workshop')

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

  const inRoom = <T>(workshopId: string, dayId: string, edit: (doc: Y.Doc) => T) =>
    editInRoom({ workshopId, dayId, authorization, presence: MODEL_PRESENCE }, edit)

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

  /**
   * Turns the people a model named into what a block stores.
   *
   * The directory is read only when somebody is actually named, and every
   * problem is reported at once under its path, like a description that does
   * not fit its schema.
   */
  const lookUpPeople = async (
    inputs: { at: string; people: PeopleInput | undefined }[],
  ): Promise<{ values: Map<string, Responsible[]>; problems: string[] }> => {
    const directory = inputs.some((input) => input.people?.length)
      ? await listAssignable(actor)
      : []
    const values = new Map<string, Responsible[]>()
    const problems: string[] = []

    for (const { at, people } of inputs) {
      if (people === undefined) continue
      const found: Responsible[] = []
      people.forEach((entry, j) => {
        const path = `${at ? `${at}.` : ''}responsible[${j}]`
        if (entry.memberId !== undefined) {
          const member = directory.find((person) => person.id === entry.memberId)
          if (!member) {
            problems.push(
              `${path}: ${entry.memberId} is not an active member of this workspace. ` +
                'Leave memberId out to name somebody from outside it.',
            )
            return
          }
          found.push({ name: member.name, memberId: member.id })
          return
        }
        const person = responsibleFromInput(entry.name ?? '', directory)
        if (person) found.push(person)
      })
      values.set(at, normalizeResponsible(found))
    }

    return { values, problems }
  }

  /** Bookkeeping, and it never fails a tool call. */
  const record = (action: string, entityId: string | null, data: Record<string, unknown> = {}) =>
    withTenant(actor, (tx) => audit(tx, action, entityId, data)).then(
      () => {},
      () => {},
    )

  return { inRoom, preflight, lookUpPeople, record }
}

/** What a tool file gets handed. */
export type DayWriter = ReturnType<typeof dayWriter>

/** What update_module may set, by kind. The editor offers exactly these. */
export const MODULE_FIELDS: readonly string[] = [
  'title',
  'durationMinutes',
  'pinnedStartMinute',
  'desc',
  'parked',
  'responsible',
]
export const CLUSTER_FIELDS: readonly string[] = ['title', 'color', 'pinnedStartMinute']

export type UpdateOutcome =
  | { kind: 'ok'; patch: BlockPatch }
  | { kind: 'missing' }
  | { kind: 'wrongKind'; isCluster: boolean; fields: string[] }
  | { kind: 'invalid'; error: ModuleDescError }

export function givenFields(fields: UpdateInput | PlannedInput): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
}

/**
 * Checks one change against the document and says what it would write.
 *
 * Writes nothing itself, so update_modules can check every entry before it
 * touches any of them.
 */
export function planUpdate(
  doc: Y.Doc,
  moduleId: string,
  fields: PlannedInput,
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

export function problemText(
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

export type ResolvedType = TypeSchema & { name: string; defaultDurationMinutes: number }

export async function readTypes(tx: Tx): Promise<Map<string, ResolvedType>> {
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

export type TypeSchema = { id: string; schemaVersion: number; jsonSchema: unknown }

/** Keyed by id, because that is what a block in the document names. */
export async function readSchemas(tx: Tx): Promise<Map<string, TypeSchema>> {
  const rows = await tx
    .select({
      id: moduleType.id,
      schemaVersion: moduleType.schemaVersion,
      jsonSchema: moduleType.jsonSchema,
    })
    .from(moduleType)
  return new Map(rows.map((row) => [row.id, row]))
}

export function moduleFrom(
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
export function unknownTypes(keys: string[], types: Map<string, ResolvedType>): string {
  return `Unknown block types: ${keys.join(', ')}. ` + `Available: ${[...types.keys()].join(', ')}`
}
