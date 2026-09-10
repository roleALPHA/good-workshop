/**
 * The GoodWorkshop schema profile.
 *
 * A deliberately small subset of JSON Schema, parsed into a flat field list the
 * UI can render. Not react-jsonschema-form, and the reason is what its output
 * looks like: a label above every field, one full-width column, its own
 * templating layer to fight. Reaching a designed form through that API costs
 * more than this file, and you stay inside its layout model.
 *
 * The `x-gw` vendor keyword is what makes the result not look generated:
 * `group` and `order` give real sections, `cols` gives side-by-side short
 * fields, `showWhen` gives progressive disclosure, and `summary` is the bridge
 * back into the agenda table.
 */

export type Widget =
  'text' | 'textarea' | 'richtext' | 'number' | 'checkbox' | 'select' | 'tags' | 'url'

export type FieldSpec = {
  key: string
  label: string
  help?: string
  widget: Widget
  /** 1–12 grid columns. Short fields sit next to each other. */
  cols: number
  group: string
  order: number
  required: boolean
  /** For select widgets. */
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  maxLength?: number
  /** Render this value as a chip in the agenda's ADDITIONAL INFO column. */
  summary: boolean
  /** Facilitator-only: excluded from participant exports. */
  private: boolean
  showWhen?: { field: string; eq: unknown }
}

export type FieldGroup = { name: string; fields: FieldSpec[] }

const DEFAULT_GROUP = 'Weitere Angaben'

type SchemaNode = Record<string, unknown>

export function parseSchema(schema: unknown): FieldGroup[] {
  if (typeof schema !== 'object' || schema === null) return []
  const properties = (schema as SchemaNode).properties
  if (typeof properties !== 'object' || properties === null) return []

  const required = new Set(
    Array.isArray((schema as SchemaNode).required)
      ? ((schema as SchemaNode).required as string[])
      : [],
  )

  const fields = Object.entries(properties as Record<string, unknown>)
    .map(([key, node]) => toField(key, node as SchemaNode, required.has(key)))
    .filter((field): field is FieldSpec => field !== null)

  const groups = new Map<string, FieldSpec[]>()
  for (const field of fields) {
    const bucket = groups.get(field.group)
    if (bucket) bucket.push(field)
    else groups.set(field.group, [field])
  }

  return [...groups.entries()].map(([name, groupFields]) => ({
    name,
    // Explicit order first, then declaration order -- a field without an order
    // must not jump to the front just because zero sorts low.
    fields: groupFields.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
  }))
}

function toField(key: string, node: SchemaNode, required: boolean): FieldSpec | null {
  const hints = (node['x-gw'] ?? {}) as Record<string, unknown>
  const widget = resolveWidget(node, hints)
  if (!widget) return null

  return {
    key,
    label: typeof node.title === 'string' ? node.title : humanise(key),
    help: typeof hints.help === 'string' ? hints.help : undefined,
    widget,
    cols: clampCols(hints.cols),
    group: typeof hints.group === 'string' ? hints.group : DEFAULT_GROUP,
    order: typeof hints.order === 'number' ? hints.order : 999,
    required,
    options: enumOptions(node),
    min: typeof node.minimum === 'number' ? node.minimum : undefined,
    max: typeof node.maximum === 'number' ? node.maximum : undefined,
    maxLength: typeof node.maxLength === 'number' ? node.maxLength : undefined,
    summary: hints.summary === true,
    private: hints.private === true,
    showWhen: parseShowWhen(hints.showWhen),
  }
}

/**
 * An explicit widget hint wins; otherwise the type and format decide. A node
 * whose type we do not support returns null and is skipped rather than
 * rendered as something wrong.
 */
function resolveWidget(node: SchemaNode, hints: Record<string, unknown>): Widget | null {
  const declared = hints.widget
  if (typeof declared === 'string' && isWidget(declared)) return declared

  if (Array.isArray(node.enum)) return 'select'

  switch (node.type) {
    case 'string':
      if (node.format === 'richtext' || node.format === 'markdown') return 'richtext'
      if (node.format === 'uri') return 'url'
      return typeof node.maxLength === 'number' && node.maxLength > 200 ? 'textarea' : 'text'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'checkbox'
    case 'array':
      // Only arrays of strings are supported; anything else is skipped rather
      // than mangled into a text box.
      return (node.items as SchemaNode | undefined)?.type === 'string' ? 'tags' : null
    default:
      return null
  }
}

function enumOptions(node: SchemaNode): { value: string; label: string }[] | undefined {
  if (!Array.isArray(node.enum)) return undefined
  const labels = ((node['x-gw'] as Record<string, unknown> | undefined)?.enumLabels ??
    {}) as Record<string, string>
  return node.enum
    .filter((value): value is string => typeof value === 'string')
    .map((value) => ({ value, label: labels[value] ?? humanise(value) }))
}

function parseShowWhen(value: unknown): FieldSpec['showWhen'] {
  if (typeof value !== 'object' || value === null) return undefined
  const condition = value as Record<string, unknown>
  return typeof condition.field === 'string'
    ? { field: condition.field, eq: condition.eq }
    : undefined
}

/** Decides whether a conditional field is currently visible. */
export function isVisible(field: FieldSpec, values: Record<string, unknown>): boolean {
  if (!field.showWhen) return true
  return values[field.showWhen.field] === field.showWhen.eq
}

const WIDGETS: readonly string[] = [
  'text',
  'textarea',
  'richtext',
  'number',
  'checkbox',
  'select',
  'tags',
  'url',
]
const isWidget = (value: string): value is Widget => WIDGETS.includes(value)

const clampCols = (value: unknown) =>
  typeof value === 'number' && value >= 1 && value <= 12 ? Math.round(value) : 12

function humanise(key: string): string {
  const spaced = key.replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** The fields the agenda table shows as chips. */
export function summaryFields(groups: FieldGroup[]): FieldSpec[] {
  return groups.flatMap((group) => group.fields.filter((field) => field.summary))
}
