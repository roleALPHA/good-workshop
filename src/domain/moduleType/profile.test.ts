import { describe, expect, it } from 'vitest'
import { BUILTIN_BY_KEY, BUILTIN_MODULE_TYPES } from './builtins'
import {
  ROW_FIELDS,
  findField,
  isVisible,
  parseSchema,
  summaryChips,
  summaryFields,
} from './profile'

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

/**
 * The chips the agenda table renders. The table used to carry its own list of
 * keys, which is why two fields flagged for it never appeared -- these say the
 * schema is what decides.
 */
describe('summary chips', () => {
  const chips = (key: string, desc: Record<string, unknown>, skip?: string[]) =>
    summaryChips(parseSchema(BUILTIN_BY_KEY[key]!.jsonSchema), desc, skip)

  it('makes one chip per entry of an array field', () => {
    expect(chips('admin', { materials: ['Flipchart', 'Marker'] }).map((c) => c.text)).toEqual([
      'Flipchart',
      'Marker',
    ])
  })

  it('renders an enum through its label, so no export or column reads a raw key', () => {
    expect(chips('decision', { method: 'dot_voting' })[0]?.text).not.toBe('dot_voting')
  })

  it('surfaces a field the table used to have no way of knowing about', () => {
    expect(chips('presentation', { presenter: 'Mira' }).map((c) => c.text)).toEqual(['Mira'])
  })

  it('leaves out a field the caller renders itself', () => {
    expect(chips('admin', { materials: ['Flipchart'] }, ['materials'])).toEqual([])
  })

  it('skips a value that has no one-line form rather than printing an object', () => {
    expect(chips('admin', { materials: [{ nope: true }, ''] })).toEqual([])
  })

  it('says nothing when the block has nothing to say', () => {
    expect(chips('admin', {})).toEqual([])
  })
})

describe('finding a single field', () => {
  it('reaches a field whatever group it was put in', () => {
    const groups = parseSchema(BUILTIN_BY_KEY.admin!.jsonSchema)
    expect(findField(groups, 'participation')?.label).toBe('Sozialform')
    expect(findField(groups, 'nonexistent')).toBeUndefined()
  })

  it('offers the localised options the picker needs', () => {
    const groups = parseSchema(BUILTIN_BY_KEY.admin!.jsonSchema)
    const options = findField(groups, 'participation')?.options ?? []
    expect(options.map((o) => o.value)).toEqual([
      'plenary',
      'small_groups',
      'pairs',
      'individual',
      'none',
    ])
    expect(options.every((o) => o.label !== o.value)).toBe(true)
  })
})

describe('parsing the same schema twice', () => {
  it('hands back the same groups, because the row components cannot memoise', () => {
    const schema = BUILTIN_BY_KEY.admin!.jsonSchema
    expect(parseSchema(schema)).toBe(parseSchema(schema))
  })
})

describe('the fields the row edits in place', () => {
  it('names only fields the built-ins actually declare', () => {
    // A key nobody declares would silently do nothing: the panel would hide a
    // field that was never there, and the row would offer a control for it.
    for (const key of ROW_FIELDS) {
      const declaring = BUILTIN_MODULE_TYPES.filter(
        (type) => findField(parseSchema(type.jsonSchema), key) !== undefined,
      )
      expect(declaring.length, `${key} wird von keinem Typ deklariert`).toBeGreaterThan(0)
    }
  })

  it('leaves the description alone, because the row shows it without editing it', () => {
    expect(ROW_FIELDS).not.toContain('description')
  })
})
