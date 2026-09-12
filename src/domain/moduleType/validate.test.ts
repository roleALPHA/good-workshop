import { describe, expect, it } from 'vitest'
import { BUILTIN_BY_KEY, BUILTIN_MODULE_TYPES } from './builtins'
import { validateModuleDesc, validateSchemaDefinition } from './validate'

const typeFor = (key: string, id = key) => ({
  id,
  schemaVersion: 1,
  jsonSchema: BUILTIN_BY_KEY[key]!.jsonSchema,
})

/**
 * Compiled validators are cached by (module type, version). The browser used
 * to pass a hardcoded 1 while the server passed the real number, so an
 * administrator who changed a type's schema left every open tab validating
 * against the old one -- and against the wrong shape, silently.
 */
describe('the compiled-validator cache', () => {
  const evolving = (schemaVersion: number, extra: Record<string, unknown>) => ({
    id: 'mt-evolving',
    schemaVersion,
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { title: { type: 'string' }, ...extra },
    },
  })

  it("does not answer for a new schema version with the old version's rules", () => {
    // v1 knows nothing about `room`.
    expect(validateModuleDesc(evolving(1, {}), { room: 'Raum 2.14' }).ok).toBe(false)

    // v2 adds it. Same type id, so a cache keyed on the id alone answers wrong.
    expect(
      validateModuleDesc(evolving(2, { room: { type: 'string' } }), { room: 'Raum 2.14' }).ok,
    ).toBe(true)
  })
})

describe('validateModuleDesc', () => {
  it('accepts an empty document', () => {
    expect(validateModuleDesc(typeFor('check_in'), {}).ok).toBe(true)
  })

  it('accepts a document matching the type', () => {
    const result = validateModuleDesc(typeFor('group_work'), {
      group_size: 4,
      deliverable: 'Ein Flipchart je Gruppe',
      participation: 'small_groups',
    })
    expect(result.ok).toBe(true)
  })

  it('names the field, the constraint and the allowed values on a bad enum', () => {
    // An LLM that gets "must be equal to one of the allowed values" cannot fix
    // its call. One that gets this can, on the next attempt.
    const result = validateModuleDesc(typeFor('check_in'), { format: 'circle' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]!.path).toBe('format')
    expect(result.errors[0]!.allowed).toContain('round')
    // The key and its argument, not a sentence: the language is chosen at the
    // boundary that renders it. See src/domain/errors.ts.
    expect(result.errors[0]!.messageKey).toBe('field.enum')
    expect(String(result.errors[0]!.params?.allowed)).toMatch(/round/)
  })

  it('rejects a field the type does not declare', () => {
    const result = validateModuleDesc(typeFor('break'), { erfunden: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]!.path).toBe('erfunden')
  })

  it('rejects a wrong type with the expected type named', () => {
    const result = validateModuleDesc(typeFor('group_work'), { group_size: 'vier' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]!.messageKey).toBe('field.type')
      expect(result.errors[0]!.params?.type).toBe('integer')
    }
  })

  it('enforces numeric bounds', () => {
    expect(validateModuleDesc(typeFor('group_work'), { group_size: 999 }).ok).toBe(false)
  })

  it('leaves the caller’s object untouched while filling defaults', () => {
    // Ajv mutates during useDefaults, which would corrupt a retried write.
    const input = { participation: 'plenary' }
    const result = validateModuleDesc(typeFor('check_in'), input)
    expect(result.ok).toBe(true)
    expect(Object.keys(input)).toEqual(['participation'])
  })

  it('refuses something that is not an object at all', () => {
    expect(validateModuleDesc(typeFor('break'), 'nope').ok).toBe(false)
    expect(validateModuleDesc(typeFor('break'), null).ok).toBe(false)
    expect(validateModuleDesc(typeFor('break'), [1, 2]).ok).toBe(false)
  })

  it('validates every shipped built-in against an empty document', () => {
    // Catches a built-in that requires a field nobody can supply at creation.
    for (const type of BUILTIN_MODULE_TYPES) {
      const result = validateModuleDesc(
        { id: type.key, schemaVersion: 1, jsonSchema: type.jsonSchema },
        {},
      )
      expect(result.ok, `${type.key} lehnt ein leeres Dokument ab`).toBe(true)
    }
  })
})

describe('validateSchemaDefinition', () => {
  const wrap = (properties: Record<string, unknown>) => ({
    type: 'object',
    additionalProperties: false,
    properties,
  })

  it('accepts every shipped built-in schema', () => {
    for (const type of BUILTIN_MODULE_TYPES) {
      const result = validateSchemaDefinition(type.jsonSchema)
      expect(result.ok, `${type.key}: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('rejects pattern outright', () => {
    // A tenant-supplied regex runs on the server thread. `format` and `enum`
    // cover the realistic cases; this will look over-strict until the first hang.
    const result = validateSchemaDefinition(wrap({ code: { type: 'string', pattern: '^(a+)+$' } }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]!.messageKey).toBe('schema.patternForbidden')
  })

  it.each(['$ref', '$dynamicRef', '$id', 'unevaluatedProperties'])('rejects %s', (keyword) => {
    const result = validateSchemaDefinition(wrap({ x: { type: 'string', [keyword]: 'anything' } }))
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown keyword', () => {
    const result = validateSchemaDefinition(wrap({ x: { type: 'string', erfunden: 1 } }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]!.messageKey).toBe('schema.keywordForbidden')
      expect(result.errors[0]!.params?.key).toBe('erfunden')
    }
  })

  it('allows property names that happen to look like keywords', () => {
    // "type" as a FIELD name is data, not a keyword. Getting this wrong would
    // make perfectly reasonable schemas unsavable.
    expect(validateSchemaDefinition(wrap({ type: { type: 'string', title: 'Art' } })).ok).toBe(true)
    expect(validateSchemaDefinition(wrap({ format: { type: 'string' } })).ok).toBe(true)
  })

  it('allows x- vendor extensions through untouched', () => {
    const result = validateSchemaDefinition(
      wrap({
        x: { type: 'string', 'x-gw': { widget: 'tags', group: 'Egal', pattern: 'harmlos' } },
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a schema that is too deeply nested', () => {
    let node: Record<string, unknown> = { type: 'string' }
    for (let i = 0; i < 12; i++) node = { type: 'object', properties: { nested: node } }
    expect(validateSchemaDefinition(node).ok).toBe(false)
  })

  it('rejects a schema that is too large', () => {
    const properties: Record<string, unknown> = {}
    for (let i = 0; i < 2000; i++) properties[`f${i}`] = { type: 'string', title: `Feld ${i}` }
    expect(validateSchemaDefinition(wrap(properties)).ok).toBe(false)
  })

  it('refuses something that is not a schema', () => {
    expect(validateSchemaDefinition('nope').ok).toBe(false)
    expect(validateSchemaDefinition(null).ok).toBe(false)
  })
})
