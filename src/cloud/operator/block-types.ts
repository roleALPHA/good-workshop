import { BUILTIN_BY_KEY, BUILTIN_MODULE_TYPES } from '@/domain/moduleType/builtins'
import {
  coerceRichText,
  describeField,
  fieldsOf,
  type BlockTypeField,
} from '@/domain/moduleType/fields'
import { validateModuleDesc } from '@/domain/moduleType/validate'
import type { DayDraft } from './catalog'

/**
 * The vocabulary a catalogue entry is written in, told to whoever is writing.
 *
 * This file exists because of one omission. `list_catalog_block_types` used to
 * answer with `Object.keys(schema.properties)` -- the field NAMES, and nothing
 * else. A model reading that learns there is a `participation` and has no way
 * to learn it is one of five fixed words; that `prompt` is a rich-text
 * document rather than a sentence; that `materials` is a list. So it guesses
 * strings, `validateModuleDesc` rejects the object, and `descFor` in
 * ../catalog/adopt.ts drops the WHOLE `desc` of that block -- not when the
 * entry is written, but later, in the workshop of whoever adopted it.
 *
 * Two answers, and they belong together: say what each field is, and check it
 * while the author can still fix it.
 */

export type { BlockTypeField }

export type BlockTypeSpec = {
  key: string
  name: string
  category: string
  defaultDurationMinutes: number
  fields: BlockTypeField[]
  /**
   * The schema itself, unabridged.
   *
   * The summary above is for reading; this is for getting it right. The tenant
   * MCP's `list_module_types` has always handed the schema over, and the
   * catalogue surface summarising it away is precisely the bug -- what a
   * summary leaves out is what the caller then has to invent.
   */
  jsonSchema: Record<string, unknown>
}

/**
 * The shipped built-ins, not a tenant's table.
 *
 * Every workspace is seeded with exactly these, and adoption resolves a key
 * against the ADOPTING tenant -- so these are the keys that are safe to write
 * into the catalogue. A workspace may have added its own; the catalogue cannot
 * know them and must not pretend to.
 */
export function blockTypeCatalogue(): BlockTypeSpec[] {
  return BUILTIN_MODULE_TYPES.map((type) => ({
    key: type.key,
    name: type.name,
    category: type.category,
    defaultDurationMinutes: type.defaultDurationMinutes,
    fields: fieldsOf(type.jsonSchema),
    jsonSchema: type.jsonSchema,
  }))
}

/** One line per type, for the text a model reads before it reads anything else. */
export function describeBlockTypes(specs: BlockTypeSpec[]): string {
  return specs
    .map(
      (spec) =>
        `${spec.key} — ${spec.name} (${spec.defaultDurationMinutes}m): ` +
        spec.fields.map(describeField).join(', '),
    )
    .join('\n')
}

/**
 * A refusal a model can act on, and the reason it is its own class.
 *
 * `opGuarded` answers every other throw with a correlation id and nothing
 * more, which is right: this endpoint sees every workspace and a Postgres
 * message would name tables to whoever holds the token. What this one carries
 * is the built-in schema shipped in the repository -- field names and their
 * allowed values, public by construction -- so it passes through intact. A
 * caller that is told "participation must be one of plenary, small_groups, …"
 * fixes the call; one that is told an id retries the same mistake.
 */
export class BlockFieldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockFieldError'
  }
}

const RENDER: Record<
  string,
  (error: { path: string; params?: Record<string, unknown> }) => string
> = {
  'field.enum': (e) => `\`${e.path}\` must be one of: ${String(e.params?.allowed ?? '')}`,
  'field.const': (e) => `\`${e.path}\` must be exactly: ${String(e.params?.allowed ?? '')}`,
  'field.unexpected': (e) => `\`${e.path}\` is not a field of this block type`,
  'field.required': (e) => `\`${e.path}\` is missing`,
  'field.type': (e) => `\`${e.path}\` must be ${String(e.params?.type ?? 'another type')}`,
}

/**
 * A block's own fields, checked and completed where the intent is unambiguous.
 *
 * ONE coercion, and only one: a plain string handed to a rich-text field is
 * read as Markdown. That is not leniency for its own sake -- writing
 * `{ format: 'tiptap-doc-v1', doc: { type: 'doc', content: [ … ] } }` by hand
 * is ProseMirror JSON, nobody gets it right from a field list, and
 * ../catalog/adopt.ts already converts a block's prose exactly this way. A
 * string for `materials` is NOT split on commas: "Marker, Tape" could as
 * easily be one item, and quietly guessing wrong is worse than refusing.
 *
 * Everything else is validated against the built-in schema and refused here,
 * where the author is still holding it -- rather than accepted, stored, and
 * dropped later by `descFor` in somebody else's workshop.
 */
export function normaliseBlockFields(
  moduleTypeKey: string,
  fields: Record<string, unknown> | undefined,
  where: string,
): Record<string, unknown> {
  const builtin = BUILTIN_BY_KEY[moduleTypeKey]
  if (!builtin) {
    throw new BlockFieldError(
      `${where}: unknown block type \`${moduleTypeKey}\`. It would arrive in an adopted ` +
        `agenda as a plain note. Known keys: ${BUILTIN_MODULE_TYPES.map((t) => t.key).join(', ')}.`,
    )
  }

  if (!fields || Object.keys(fields).length === 0) return {}

  const spec = fieldsOf(builtin.jsonSchema)
  const coerced = coerceRichText(builtin.jsonSchema, fields)

  const result = validateModuleDesc(
    { id: builtin.key, schemaVersion: 1, jsonSchema: builtin.jsonSchema },
    coerced,
  )
  if (result.ok) return result.value as Record<string, unknown>

  // Named against the spec rather than against Ajv's path: a failure inside a
  // rich-text document reads `prompt.format`, and what the caller needs to be
  // told is what `prompt` takes.
  const said = result.errors.map((error) => {
    const rendered = RENDER[error.messageKey]?.(error) ?? `\`${error.path}\` is not valid`
    const field = spec.find((f) => f.name === error.path.split('.')[0])
    return field ? `${rendered} (${describeField(field)})` : rendered
  })

  throw new BlockFieldError(
    `${where}: ${said.join('; ')}. Call list_catalog_block_types for what \`${moduleTypeKey}\` accepts.`,
  )
}

/**
 * Every block of a whole `set_catalog_blocks` call, checked in one pass.
 *
 * Two of the three ways to get a block wrong are not about a single field. A
 * module with no `moduleTypeKey` and a cluster carrying one are both refused
 * by a database constraint -- `(kind = 'module') = (module_type_key is not
 * null)` -- but a constraint violation reaches a model as a correlation id,
 * and it cannot act on that. Saying it here costs one pass over the days.
 *
 * Fields on a cluster are refused rather than dropped: a cluster is a heading
 * with children, it has no schema of its own, and silently discarding what
 * somebody wrote there is how the work looks done and is not.
 *
 * Whole call or nothing. `op_catalog_set_blocks` replaces what is there, so a
 * call half-refused would leave an entry half-written -- the same reason
 * apply_agenda takes a day at a time.
 */
export function normaliseDays(days: DayDraft[]): DayDraft[] {
  return days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => {
      const where = `day ${day.ordinal}, block ${block.ordinal}`

      if (block.kind === 'cluster') {
        if (block.moduleTypeKey || (block.fields && Object.keys(block.fields).length > 0)) {
          throw new BlockFieldError(
            `${where}: a cluster is a heading with steps inside it -- it takes no ` +
              '`moduleTypeKey` and no `fields`. Put them on the modules within it.',
          )
        }
        return block
      }

      if (!block.moduleTypeKey) {
        throw new BlockFieldError(
          `${where}: a module must name its block type in \`moduleTypeKey\`. ` +
            `Known keys: ${BUILTIN_MODULE_TYPES.map((t) => t.key).join(', ')}.`,
        )
      }

      return { ...block, fields: normaliseBlockFields(block.moduleTypeKey, block.fields, where) }
    }),
  }))
}
