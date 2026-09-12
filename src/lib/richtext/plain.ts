import type { RichTextNode, RichTextValue } from './schema'

/**
 * Plain-text bridge for rich text fields that have no real editor yet.
 *
 * The rule this exists to enforce: never silently flatten formatting. A
 * document that is nothing but paragraphs round-trips through a textarea
 * losslessly; one that contains lists or marks does not, and the UI must show
 * it read-only rather than quietly destroying it on the next keystroke.
 */

export function isPlainParagraphs(value: RichTextValue): boolean {
  const content = value.doc.content ?? []
  return content.every(
    (node) =>
      node.type === 'paragraph' &&
      (node.content ?? []).every((child) => child.type === 'text' && !child.marks?.length),
  )
}

export function toPlainText(value: RichTextValue): string {
  return (value.doc.content ?? [])
    .map((node) => (node.content ?? []).map((child) => child.text ?? '').join(''))
    .join('\n')
}

export function fromPlainText(text: string): RichTextValue {
  const paragraphs: RichTextNode[] = text
    .split('\n')
    .map((line) =>
      line === ''
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] },
    )

  return {
    format: 'tiptap-doc-v1',
    doc: { type: 'doc', content: paragraphs },
    text,
  }
}
