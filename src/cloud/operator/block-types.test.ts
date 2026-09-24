import { describe, expect, it } from 'vitest'
import {
  BlockFieldError,
  blockTypeCatalogue,
  describeBlockTypes,
  normaliseBlockFields,
  normaliseDays,
} from './block-types'

/**
 * What an authoring model is told about a block's own fields.
 *
 * The bug these tests exist for: `list_catalog_block_types` used to answer with
 * `Object.keys(schema.properties)` -- the field NAMES and nothing else. A model
 * reading that learns there is a `participation` and has no way to learn it is
 * one of five words, that `prompt` is a rich-text document rather than a
 * sentence, or that `materials` is a list. It guesses, `validateModuleDesc`
 * rejects the object, and `descFor` drops the WHOLE `desc` of that block --
 * silently, and not when the entry is written but when somebody adopts it.
 */
describe('the block-type vocabulary', () => {
  const checkIn = () => blockTypeCatalogue().find((type) => type.key === 'check_in')!

  it('names the values an enum field allows', () => {
    const participation = checkIn().fields.find((f) => f.name === 'participation')!
    expect(participation.allowed).toEqual([
      'plenary',
      'small_groups',
      'pairs',
      'individual',
      'none',
    ])
  })

  it('calls a rich-text field rich text, not an object', () => {
    expect(checkIn().fields.find((f) => f.name === 'prompt')!.type).toBe('richtext')
  })

  it('distinguishes a list from a word and a number', () => {
    const by = Object.fromEntries(checkIn().fields.map((f) => [f.name, f.type]))
    expect(by.materials).toBe('string[]')
    expect(by.format).toBe('string')
    expect(by.timebox_per_person_seconds).toBe('integer')
  })

  it('hands over the schema itself, so nothing is lost in the summary', () => {
    expect(checkIn().jsonSchema).toMatchObject({ type: 'object', additionalProperties: false })
  })

  it('spells the allowed values out in the text a model reads first', () => {
    const line = describeBlockTypes(blockTypeCatalogue())
      .split('\n')
      .find((l) => l.startsWith('check_in'))!
    expect(line).toContain('participation: plenary|small_groups|pairs|individual|none')
    expect(line).toContain('prompt: richtext')
  })
})

/**
 * The other half: a wrong field has to be refused HERE, while the author can
 * still fix it, rather than dropped later in somebody else's workshop.
 */
describe('checking a block’s fields as they are written', () => {
  it('takes Markdown for a rich-text field and stores a document', () => {
    const fields = normaliseBlockFields(
      'check_in',
      { prompt: 'What do we **need**?' },
      'day 1, block 2',
    )
    expect(fields.prompt).toMatchObject({ format: 'tiptap-doc-v1' })
    expect((fields.prompt as { text: string }).text).toContain('What do we need?')
  })

  it('leaves a rich-text document that is already one alone', () => {
    const doc = { format: 'tiptap-doc-v1', doc: { type: 'doc', content: [] }, text: '' }
    expect(normaliseBlockFields('check_in', { prompt: doc }, 'x').prompt).toEqual(doc)
  })

  it('passes a correct enum, a list and a number through untouched', () => {
    expect(
      normaliseBlockFields(
        'check_in',
        { participation: 'pairs', materials: ['Marker'], timebox_per_person_seconds: 60 },
        'x',
      ),
    ).toEqual({ participation: 'pairs', materials: ['Marker'], timebox_per_person_seconds: 60 })
  })

  it('refuses a value outside an enum and names the ones that are allowed', () => {
    expect(() =>
      normaliseBlockFields('check_in', { participation: 'group' }, 'day 1, block 2'),
    ).toThrow(BlockFieldError)
    expect(() =>
      normaliseBlockFields('check_in', { participation: 'group' }, 'day 1, block 2'),
    ).toThrow(/participation.*small_groups/s)
  })

  it('refuses a field the type does not have, naming the block', () => {
    expect(() =>
      normaliseBlockFields('check_in', { individual_first: true }, 'day 1, block 2'),
    ).toThrow(/day 1, block 2/)
  })

  it('refuses a word where the type wants a list, rather than splitting it', () => {
    expect(() => normaliseBlockFields('check_in', { materials: 'Marker, Tape' }, 'x')).toThrow(
      BlockFieldError,
    )
  })

  it('refuses an unknown block type, because that key reaches an agenda as a bare note', () => {
    expect(() => normaliseBlockFields('workshop_magic', {}, 'day 1, block 1')).toThrow(
      /workshop_magic/,
    )
  })

  it('accepts a module with no fields at all', () => {
    expect(normaliseBlockFields('check_in', undefined, 'x')).toEqual({})
  })
})

/**
 * The whole call, because two of the three ways to get this wrong are not
 * about one field: a module that names no block type, and fields hung on a
 * cluster, which has none of its own.
 */
describe('checking the days of one set_catalog_blocks call', () => {
  const day = (blocks: unknown[]) => [{ ordinal: 1, blocks }] as Parameters<typeof normaliseDays>[0]

  it('converts every module’s fields in place', () => {
    const days = normaliseDays(
      day([
        { ordinal: 1, kind: 'cluster' },
        {
          ordinal: 2,
          kind: 'module',
          parentOrdinal: 1,
          moduleTypeKey: 'check_in',
          fields: { prompt: 'Why?' },
        },
      ]),
    )
    expect(days[0]!.blocks[1]!.fields).toMatchObject({ prompt: { format: 'tiptap-doc-v1' } })
  })

  it('refuses a module that names no block type', () => {
    expect(() => normaliseDays(day([{ ordinal: 1, kind: 'module' }]))).toThrow(/moduleTypeKey/)
  })

  it('refuses fields on a cluster, which has none of its own', () => {
    expect(() =>
      normaliseDays(day([{ ordinal: 1, kind: 'cluster', fields: { prompt: 'Why?' } }])),
    ).toThrow(BlockFieldError)
  })

  it('names the day and the block, so a long call can be corrected', () => {
    expect(() =>
      normaliseDays([
        { ordinal: 1, blocks: [] },
        { ordinal: 2, blocks: [{ ordinal: 7, kind: 'module', moduleTypeKey: 'nope' }] },
      ] as Parameters<typeof normaliseDays>[0]),
    ).toThrow(/day 2, block 7/)
  })
})
