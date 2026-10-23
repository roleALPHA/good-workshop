import type { RichTextValue } from './schema'

/**
 * Rich text as one line of plain text per block, for places that only show it.
 *
 * Lossy on purpose; editing goes through `markdown.ts`, which is not.
 */

export function toPlainText(value: RichTextValue): string {
  return (value.doc.content ?? [])
    .map((node) => (node.content ?? []).map((child) => child.text ?? '').join(''))
    .join('\n')
}
