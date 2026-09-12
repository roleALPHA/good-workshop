import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { DomainError } from '@/domain/errors'

/**
 * The one place a module's `desc` is validated.
 *
 * Ajv rather than a Zod translation, and the reason is that schemas are RUNTIME
 * DATA: a tenant creates a module type at 15:00 and a module is validated
 * against it at 15:01. Converters cover a subset of the spec and lose error
 * detail exactly where tenant-authored schemas get creative.
 *
 * The split is crisp and worth keeping: Zod validates the request envelope,
 * Ajv validates `json_desc` against the tenant's schema.
 */

/**
 * A key and its arguments, never a sentence.
 *
 * These reach three audiences with three languages: the inspector renders them
 * next to the field in the person's own language, a server action folds them
 * into an ActionResult, and MCP shows them to a model in English. See
 * src/domain/errors.ts for why the domain layer refuses to pick one.
 */
export const FIELD_ERROR_KEYS = [
  'desc.notObject',
  'field.enum',
  'field.required',
  'field.unexpected',
  'field.type',
  'field.invalid',
  'schema.broken',
  'schema.notObject',
  'schema.tooLarge',
  'schema.tooDeep',
  'schema.uncompilable',
  'schema.patternForbidden',
  'schema.keywordForbidden',
] as const

export type FieldErrorKey = (typeof FIELD_ERROR_KEYS)[number]

export type FieldError = {
  path: string
  messageKey: FieldErrorKey
  params?: Record<string, string | number>
  allowed?: unknown[]
}

/**
 * A failed `desc` validation, as something throwable.
 *
 * Carries the field errors rather than a rendered sentence: the boundary that
 * catches it knows which language to render them in, and the same list is shown
 * inline in the inspector, folded into a server action's result, and handed to
 * a model in English.
 */
export class ModuleDescError extends DomainError {
  constructor(readonly issues: FieldError[]) {
    super('workshop.descInvalid', { count: issues.length })
  }
}

export type ValidationResult =
  { ok: true; value: Record<string, unknown> } | { ok: false; errors: FieldError[] }

const ajv = new Ajv2020({
  // Fills schema defaults into the stored document, so it is always complete
  // and neither the renderer nor the exporter ever needs `?? fallback`.
  useDefaults: true,
  allErrors: true,
  strict: false,
  // Tenant schemas are data, not code: never let one reach across the network.
  loadSchema: undefined,
})
addFormats(ajv)

// Custom formats used by the built-ins. Declared rather than left unknown so a
// typo in a schema is caught at save time instead of silently accepting anything.
ajv.addFormat('richtext', () => true)
ajv.addFormat('markdown', () => true)

const compiled = new Map<string, ValidateFunction>()

/** Compiled validators are cached by (module type, version) -- the hot path is a call. */
function validatorFor(cacheKey: string, schema: object): ValidateFunction {
  const existing = compiled.get(cacheKey)
  if (existing) return existing
  const validate = ajv.compile(schema)
  compiled.set(cacheKey, validate)
  return validate
}

export function validateModuleDesc(
  type: { id: string; schemaVersion: number; jsonSchema: unknown },
  desc: unknown,
): ValidationResult {
  if (typeof desc !== 'object' || desc === null || Array.isArray(desc)) {
    return { ok: false, errors: [{ path: '', messageKey: 'desc.notObject' }] }
  }

  // Ajv mutates the input when filling defaults; a copy keeps the caller's
  // object untouched, which matters when a write is retried.
  const value = structuredClone(desc) as Record<string, unknown>

  let validate: ValidateFunction
  try {
    validate = validatorFor(`${type.id}:${type.schemaVersion}`, type.jsonSchema as object)
  } catch {
    // A schema that will not compile is a broken module type, not a broken
    // module. Refusing every write against it would be worse than accepting
    // the document unvalidated and flagging the type.
    return { ok: false, errors: [{ path: '', messageKey: 'schema.broken' }] }
  }

  if (validate(value)) return { ok: true, value }

  return { ok: false, errors: (validate.errors ?? []).map(toFieldError) }
}

/**
 * Errors are written to be acted on.
 *
 * An LLM client that gets "must be equal to one of the allowed values" cannot
 * fix its call; one that gets the field, the constraint and the allowed values
 * fixes it on the next attempt.
 */
function toFieldError(error: ErrorObject): FieldError {
  const path = error.instancePath.replace(/^\//, '').replaceAll('/', '.')

  switch (error.keyword) {
    case 'enum': {
      const allowed = error.params.allowedValues as unknown[]
      return {
        path,
        messageKey: 'field.enum',
        params: { allowed: allowed.join(', ') },
        allowed,
      }
    }
    case 'required':
      return { path: String(error.params.missingProperty), messageKey: 'field.required' }
    case 'additionalProperties':
      return { path: String(error.params.additionalProperty), messageKey: 'field.unexpected' }
    case 'type':
      return { path, messageKey: 'field.type', params: { type: String(error.params.type) } }
    default:
      // Ajv's own `message` is English prose. Leaking it into a German or
      // Spanish interface is what used to happen here; naming the keyword
      // instead keeps the detail without the language.
      return { path, messageKey: 'field.invalid', params: { keyword: error.keyword } }
  }
}

// ── Meta-validation ────────────────────────────────────────────────────────

const ALLOWED_KEYWORDS = new Set([
  '$schema',
  'type',
  'properties',
  'items',
  'required',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'uniqueItems',
  'format',
  'default',
  'title',
  'description',
  'examples',
  'additionalProperties',
  'allOf',
  'anyOf',
  'oneOf',
  '$defs',
])

const MAX_SCHEMA_BYTES = 32 * 1024
const MAX_DEPTH = 6

/**
 * A tenant-authored schema is untrusted input, and this is the surface most
 * people miss.
 *
 * `pattern` is rejected outright in v1: a tenant-supplied regular expression is
 * a ReDoS vector executed on the server thread, and `format` covers the
 * realistic cases. That will look over-strict right up until the first hang.
 */
export function validateSchemaDefinition(schema: unknown): ValidationResult {
  const errors: FieldError[] = []

  if (typeof schema !== 'object' || schema === null) {
    return { ok: false, errors: [{ path: '', messageKey: 'schema.notObject' }] }
  }

  const serialised = JSON.stringify(schema)
  if (serialised.length > MAX_SCHEMA_BYTES) {
    errors.push({ path: '', messageKey: 'schema.tooLarge', params: { max: MAX_SCHEMA_BYTES } })
  }

  walk(schema, '', 0, errors)

  if (errors.length === 0) {
    try {
      ajv.compile(schema as object)
    } catch (error) {
      errors.push({
        path: '',
        messageKey: 'schema.uncompilable',
        // Ajv's reason, verbatim and in English. It names a keyword and a
        // pointer, which is what a schema author needs; paraphrasing it in four
        // languages would lose exactly that.
        params: { reason: error instanceof Error ? error.message : '' },
      })
    }
  }

  return errors.length === 0
    ? { ok: true, value: schema as Record<string, unknown> }
    : { ok: false, errors }
}

/**
 * @param keysAreNames true when this object's keys are user-chosen field names
 *   rather than schema keywords -- inside `properties` and `$defs`. Tracked as
 *   a flag while descending rather than guessed from the path, because a field
 *   legitimately called "type", "format" or even "pattern" must not be mistaken
 *   for the keyword of the same name.
 */
function walk(
  node: unknown,
  path: string,
  depth: number,
  errors: FieldError[],
  keysAreNames = false,
): void {
  if (depth > MAX_DEPTH) {
    errors.push({ path, messageKey: 'schema.tooDeep', params: { max: MAX_DEPTH } })
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1, errors))
    return
  }
  if (typeof node !== 'object' || node === null) return

  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key

    if (keysAreNames) {
      // A field definition. Its own keys are keywords again.
      walk(value, childPath, depth + 1, errors, false)
      continue
    }

    // Vendor extensions carry the UI hints and never reach Ajv's evaluation,
    // so their contents are not constrained.
    if (key.startsWith('x-')) continue

    if (key === 'pattern') {
      errors.push({ path: childPath, messageKey: 'schema.patternForbidden' })
      continue
    }
    if (
      key === '$ref' ||
      key === '$dynamicRef' ||
      key === '$id' ||
      key === 'unevaluatedProperties'
    ) {
      errors.push({ path: childPath, messageKey: 'schema.keywordForbidden', params: { key } })
      continue
    }
    if (!ALLOWED_KEYWORDS.has(key)) {
      errors.push({ path: childPath, messageKey: 'schema.keywordForbidden', params: { key } })
      continue
    }

    walk(value, childPath, depth + 1, errors, key === 'properties' || key === '$defs')
  }
}
