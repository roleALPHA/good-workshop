import { describe, expect, it } from 'vitest'
import { BUILTIN_BY_KEY } from './builtins'
import { coerceRichText, describeFields } from './fields'
import { validateModuleDesc } from './validate'

const groupWork = BUILTIN_BY_KEY.group_work!

describe('describeFields', () => {
  it('names rich text, lists and the words an enum allows', () => {
    const line = describeFields(groupWork.jsonSchema)
    expect(line).toContain('description: richtext')
    expect(line).toContain('materials: string[]')
    expect(line).toMatch(/participation: plenary\|small_groups/)
  })
})

/**
 * The reason this exists: a model over MCP could not fill a rich-text field.
 * It guessed some forty `format` values, every one refused, and fell back to a
 * plain note -- writing the document by hand is ProseMirror JSON.
 */
describe('coerceRichText', () => {
  it('reads a string in a rich-text field as Markdown', () => {
    const desc = coerceRichText(groupWork.jsonSchema, {
      description: 'Worum es geht\n\n- erstens\n- **zweitens**',
    })

    expect(desc.description).toMatchObject({
      format: 'tiptap-doc-v1',
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph' }, { type: 'bulletList' }],
      },
    })
    expect(validateModuleDesc({ id: 'gw', schemaVersion: 1, ...groupWork }, desc).ok).toBe(true)
  })

  it('leaves a document, other fields and other types alone', () => {
    const doc = { format: 'tiptap-doc-v1', doc: { type: 'doc' } }
    const input = { description: doc, deliverable: 'Flipchart', group_size: 4 }
    expect(coerceRichText(groupWork.jsonSchema, input)).toEqual(input)
  })

  it('does not turn a string into a document where the field is not rich text', () => {
    // Refused by the schema afterwards, as it should be -- not silently fixed.
    expect(coerceRichText(groupWork.jsonSchema, { group_size: 'vier' })).toEqual({
      group_size: 'vier',
    })
  })
})
