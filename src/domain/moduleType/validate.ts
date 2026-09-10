import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

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

export type FieldError = { path: string; message: string; allowed?: unknown[] }

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
    return { ok: false, errors: [{ path: '', message: 'desc muss ein Objekt sein.' }] }
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
    return {
      ok: false,
      errors: [{ path: '', message: 'Das Schema dieses Modultyps ist ungültig.' }],
    }
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
    case 'enum':
      return {
        path,
        message: `muss einer dieser Werte sein: ${(error.params.allowedValues as unknown[]).join(', ')}`,
        allowed: error.params.allowedValues as unknown[],
      }
    case 'required':
      return { path: String(error.params.missingProperty), message: 'ist erforderlich' }
    case 'additionalProperties':
      return {
        path: String(error.params.additionalProperty),
        message: 'ist in diesem Modultyp nicht vorgesehen',
      }
    case 'type':
      return { path, message: `muss vom Typ ${String(error.params.type)} sein` }
    default:
      return { path, message: error.message ?? 'ist ungültig' }
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
    return { ok: false, errors: [{ path: '', message: 'Das Schema muss ein Objekt sein.' }] }
  }

  const serialised = JSON.stringify(schema)
  if (serialised.length > MAX_SCHEMA_BYTES) {
    errors.push({ path: '', message: `Das Schema ist zu groß (max. ${MAX_SCHEMA_BYTES} Bytes).` })
  }

  walk(schema, '', 0, errors)

  if (errors.length === 0) {
    try {
      ajv.compile(schema as object)
    } catch (error) {
      errors.push({
        path: '',
        message: error instanceof Error ? error.message : 'Das Schema lässt sich nicht übersetzen.',
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
    errors.push({ path, message: `Zu tief verschachtelt (max. ${MAX_DEPTH} Ebenen).` })
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
      errors.push({
        path: childPath,
        message:
          'pattern ist nicht erlaubt: ein selbst geschriebener regulärer Ausdruck kann den Server blockieren. Nutze stattdessen format oder enum.',
      })
      continue
    }
    if (
      key === '$ref' ||
      key === '$dynamicRef' ||
      key === '$id' ||
      key === 'unevaluatedProperties'
    ) {
      errors.push({ path: childPath, message: `${key} ist nicht erlaubt.` })
      continue
    }
    if (!ALLOWED_KEYWORDS.has(key)) {
      errors.push({ path: childPath, message: `Das Schlüsselwort "${key}" ist nicht erlaubt.` })
      continue
    }

    walk(value, childPath, depth + 1, errors, key === 'properties' || key === '$defs')
  }
}
