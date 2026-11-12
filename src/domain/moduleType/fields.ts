import { markdownToRichText } from '@/lib/richtext/markdown'

/**
 * A block type's fields, in the terms a caller writes them in.
 *
 * For whoever writes a `desc` without the editor: a model over MCP, the
 * operator console authoring a catalogue entry. The schema itself is the
 * truth, but it is not readable at a glance -- `participation` is one of five
 * fixed words, `materials` is a list, and `description` is a ProseMirror
 * document that nobody writes correctly from a field name. A model that is
 * told only the names guesses strings, and every guess is refused.
 *
 * Both MCP surfaces read this, and the tenant one exists in both editions, so
 * it lives here rather than beside the operator console in src/cloud.
 */

/** What one field of a block type accepts. */
export type BlockTypeField = {
  name: string
  /** `richtext`, `string`, `string[]`, `integer`, `number`, `boolean`. */
  type: string
  /** The only values an enum field takes. */
  allowed?: string[]
  required: boolean
  /** The type's own label, which is authored per installation and may be German. */
  label?: string
}

type Property = {
  type?: string
  enum?: unknown[]
  items?: { type?: string }
  title?: string
  'x-gw'?: { widget?: string }
}

/**
 * `object` plus the rich-text widget is the one shape a caller cannot guess.
 *
 * It is `{ format: 'tiptap-doc-v1', doc: … }` with `additionalProperties:
 * false`, so a sentence written into it fails every time. Naming it `richtext`
 * rather than `object` is what lets `coerceRichText` accept Markdown.
 */
function fieldType(property: Property): string {
  if (property.type === 'object' && property['x-gw']?.widget === 'richtext') return 'richtext'
  if (property.type === 'array') return `${property.items?.type ?? 'string'}[]`
  return property.type ?? 'string'
}

export function fieldsOf(jsonSchema: unknown): BlockTypeField[] {
  if (typeof jsonSchema !== 'object' || jsonSchema === null) return []
  const schema = jsonSchema as Record<string, unknown>
  const properties = (schema.properties ?? {}) as Record<string, Property>
  const required = new Set((schema.required as string[] | undefined) ?? [])
  return Object.entries(properties).map(([name, property]) => ({
    name,
    type: fieldType(property),
    ...(property.enum ? { allowed: property.enum.map(String) } : {}),
    required: required.has(name),
    ...(property.title ? { label: property.title } : {}),
  }))
}

export const describeField = (field: BlockTypeField) =>
  `${field.name}: ${field.allowed ? field.allowed.join('|') : field.type}`

/** One field list, for the line a model reads about a type. */
export const describeFields = (jsonSchema: unknown) =>
  fieldsOf(jsonSchema).map(describeField).join(', ')

/** Said once wherever a model is shown `richtext`, so it knows what to send. */
export const RICHTEXT_HINT =
  'A richtext field takes a Markdown string: paragraphs, bullet or numbered lists, ' +
  '**bold**, *italic* and links.'

/**
 * A plain string handed to a rich-text field, read as Markdown.
 *
 * The one coercion, and only this one: a string where a document belongs has
 * exactly one reading, and `markdownToRichText` produces the same document the
 * editor would. Anything else -- an object, a number, a string in a field that
 * is not rich text -- is passed through untouched and left to the schema to
 * accept or refuse. "Marker, Tape" for `materials` is not split on commas: it
 * could as easily be one item, and quietly guessing wrong is worse than
 * refusing.
 */
export function coerceRichText(
  jsonSchema: unknown,
  desc: Record<string, unknown>,
): Record<string, unknown> {
  const richtext = new Set(
    fieldsOf(jsonSchema)
      .filter((field) => field.type === 'richtext')
      .map((field) => field.name),
  )
  if (richtext.size === 0) return desc

  return Object.fromEntries(
    Object.entries(desc).map(([name, value]) => [
      name,
      richtext.has(name) && typeof value === 'string' ? markdownToRichText(value) : value,
    ]),
  )
}
