/**
 * The description schema, deliberately tiny.
 *
 * A block description is a description: bold, italic, links and (nested)
 * lists -- no headings, no tables, no images, no colours. Keeping the node set
 * this small is what keeps the Markdown export lossless and the agenda table
 * visually calm, and it is the allowlist the server validates incoming
 * documents against before they reach a JSONB column.
 *
 * Content is stored as ProseMirror JSON, not HTML: no sanitisation dance,
 * diffable, and the shape `y-prosemirror` speaks if real-time collaboration
 * ever lands.
 */

export const ALLOWED_NODES = [
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'bulletList',
  'orderedList',
  'listItem',
] as const

export const ALLOWED_MARKS = ['bold', 'italic', 'link'] as const

export type AllowedNode = (typeof ALLOWED_NODES)[number]
export type AllowedMark = (typeof ALLOWED_MARKS)[number]

export type RichTextMark = { type: string; attrs?: Record<string, unknown> }

export type RichTextNode = {
  type: string
  text?: string
  marks?: RichTextMark[]
  content?: RichTextNode[]
  attrs?: Record<string, unknown>
}

export type RichTextValue = {
  format: 'tiptap-doc-v1'
  doc: RichTextNode
  /** Denormalised plaintext, kept for search and for the "outline" export flavour. */
  text: string
}

export function isRichTextValue(value: unknown): value is RichTextValue {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<RichTextValue>
  return v.format === 'tiptap-doc-v1' && typeof v.doc === 'object' && v.doc !== null
}

export function isAllowedNode(type: string): type is AllowedNode {
  return (ALLOWED_NODES as readonly string[]).includes(type)
}

export function isAllowedMark(type: string): type is AllowedMark {
  return (ALLOWED_MARKS as readonly string[]).includes(type)
}
