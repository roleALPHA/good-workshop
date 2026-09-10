import { describe, expect, it } from 'vitest'
import { BUILTIN_BY_KEY, BUILTIN_MODULE_TYPES } from './builtins'
import { isVisible, parseSchema, summaryFields } from './profile'

const wrap = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
})

const flat = (schema: unknown) => parseSchema(schema).flatMap((g) => g.fields)
const field = (schema: unknown, key: string) => flat(schema).find((f) => f.key === key)!

describe('parseSchema / widget resolution', () => {
  it.each([
    [{ type: 'string' }, 'text'],
    [{ type: 'string', maxLength: 500 }, 'textarea'],
    [{ type: 'string', format: 'richtext' }, 'richtext'],
    [{ type: 'string', format: 'uri' }, 'url'],
    [{ type: 'string', enum: ['a', 'b'] }, 'select'],
    [{ type: 'integer' }, 'number'],
    [{ type: 'number' }, 'number'],
    [{ type: 'boolean' }, 'checkbox'],
    [{ type: 'array', items: { type: 'string' } }, 'tags'],
  ])('derives %j as %s', (node, expected) => {
    expect(field(wrap({ x: node }), 'x').widget).toBe(expected)
  })

  it('lets an explicit hint override the derived widget', () => {
    expect(field(wrap({ x: { type: 'string', 'x-gw': { widget: 'textarea' } } }), 'x').widget).toBe(
      'textarea',
    )
  })

  it('skips a type it cannot render rather than mangling it', () => {
    // An array of objects rendered as a text box would silently destroy data.
    expect(flat(wrap({ x: { type: 'array', items: { type: 'object' } } }))).toHaveLength(0)
    expect(flat(wrap({ x: { type: 'null' } }))).toHaveLength(0)
  })
})

describe('parseSchema / layout', () => {
  it('groups fields and keeps the declared order', () => {
    const groups = parseSchema(
      wrap({
        b: { type: 'string', 'x-gw': { group: 'Ablauf', order: 2 } },
        a: { type: 'string', 'x-gw': { group: 'Ablauf', order: 1 } },
        c: { type: 'string', 'x-gw': { group: 'Inhalt', order: 1 } },
      }),
    )
    expect(groups.map((g) => g.name)).toEqual(['Ablauf', 'Inhalt'])
    expect(groups[0]!.fields.map((f) => f.key)).toEqual(['a', 'b'])
  })

  it('does not let an unordered field jump ahead of an ordered one', () => {
    // Defaulting order to 0 would do exactly that, which is why it is 999.
    const fields = parseSchema(
      wrap({ ohne: { type: 'string' }, mit: { type: 'string', 'x-gw': { order: 5 } } }),
    )[0]!.fields
    expect(fields.map((f) => f.key)).toEqual(['mit', 'ohne'])
  })

  it('falls back to a default group', () => {
    expect(parseSchema(wrap({ x: { type: 'string' } }))[0]!.name).toBe('Weitere Angaben')
  })

  it('clamps column widths to the grid', () => {
    expect(field(wrap({ x: { type: 'string', 'x-gw': { cols: 99 } } }), 'x').cols).toBe(12)
    expect(field(wrap({ x: { type: 'string', 'x-gw': { cols: 6 } } }), 'x').cols).toBe(6)
  })

  it('derives a readable label when the schema has no title', () => {
    expect(field(wrap({ room_setup: { type: 'string' } }), 'room_setup').label).toBe('Room setup')
  })

  it('marks required fields', () => {
    expect(field(wrap({ x: { type: 'string' } }, ['x']), 'x').required).toBe(true)
  })
})

describe('parseSchema / select options', () => {
  it('humanises enum values that have no label', () => {
    const options = field(wrap({ x: { type: 'string', enum: ['small_groups'] } }), 'x').options
    expect(options).toEqual([{ value: 'small_groups', label: 'Small groups' }])
  })

  it('uses explicit labels when given', () => {
    const options = field(
      wrap({ x: { type: 'string', enum: ['a'], 'x-gw': { enumLabels: { a: 'Alpha' } } } }),
      'x',
    ).options
    expect(options).toEqual([{ value: 'a', label: 'Alpha' }])
  })
})

describe('isVisible', () => {
  const schema = wrap({
    needs: { type: 'boolean' },
    detail: { type: 'string', 'x-gw': { showWhen: { field: 'needs', eq: true } } },
  })

  it('hides a conditional field until its condition holds', () => {
    expect(isVisible(field(schema, 'detail'), {})).toBe(false)
    expect(isVisible(field(schema, 'detail'), { needs: false })).toBe(false)
    expect(isVisible(field(schema, 'detail'), { needs: true })).toBe(true)
  })

  it('always shows an unconditional field', () => {
    expect(isVisible(field(schema, 'needs'), {})).toBe(true)
  })
})

describe('against the shipped built-ins', () => {
  it('parses every built-in into at least the base fields', () => {
    for (const type of BUILTIN_MODULE_TYPES) {
      const fields = flat(type.jsonSchema)
      expect(
        fields.map((f) => f.key),
        type.key,
      ).toContain('description')
      expect(
        fields.map((f) => f.key),
        type.key,
      ).toContain('facilitator_notes')
    }
  })

  it('keeps facilitator notes marked private, so exports can leave them out', () => {
    expect(field(BUILTIN_BY_KEY.group_work!.jsonSchema, 'facilitator_notes').private).toBe(true)
  })

  it('surfaces exactly the fields meant for the agenda table', () => {
    // The guardrail against the product turning into a database admin panel:
    // only summary fields reach the table, everything else stays in the inspector.
    const groups = parseSchema(BUILTIN_BY_KEY.group_work!.jsonSchema)
    expect(
      summaryFields(groups)
        .map((f) => f.key)
        .sort(),
    ).toEqual(['deliverable', 'materials'])
  })
})
