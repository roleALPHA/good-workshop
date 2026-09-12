import { isAllowedMark, isAllowedNode, type RichTextNode, type RichTextValue } from './schema'

/**
 * ProseMirror JSON to Markdown.
 *
 * Shared by the exporter and anything else that needs plain text out of a
 * description. Unknown nodes are dropped rather than throwing: an export that
 * fails because of one odd node is worse than an export that loses a little
 * formatting.
 */
export function richTextToMarkdown(value: RichTextValue, indent = ''): string {
  return renderNodes(value.doc.content ?? [], indent)
    .join('\n\n')
    .trim()
}

function renderNodes(nodes: RichTextNode[], indent: string): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (!isAllowedNode(node.type)) continue

    switch (node.type) {
      case 'paragraph':
        out.push(indent + renderInline(node.content ?? []))
        break
      case 'bulletList':
        out.push(renderList(node, indent, () => '- '))
        break
      case 'orderedList':
        out.push(renderList(node, indent, (i) => `${i + 1}. `))
        break
      default:
        break
    }
  }
  return out.filter((block) => block.trim() !== '')
}

function renderList(node: RichTextNode, indent: string, marker: (index: number) => string): string {
  const lines: string[] = []

  ;(node.content ?? []).forEach((item, index) => {
    if (item.type !== 'listItem') return
    const bullet = marker(index)
    const childIndent = indent + ' '.repeat(bullet.length)

    ;(item.content ?? []).forEach((child, childIndex) => {
      if (child.type === 'paragraph') {
        const text = renderInline(child.content ?? [])
        lines.push(childIndex === 0 ? indent + bullet + text : childIndent + text)
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        // Nested lists indent by the parent's marker width, which is what makes
        // the result render correctly in every Markdown flavour rather than
        // only in the lenient ones.
        lines.push(
          renderList(
            child,
            childIndent,
            child.type === 'bulletList' ? () => '- ' : (i) => `${i + 1}. `,
          ),
        )
      }
    })
  })

  return lines.join('\n')
}

function renderInline(nodes: RichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n'
      if (node.type !== 'text') return ''

      let text = node.text ?? ''
      for (const mark of node.marks ?? []) {
        if (!isAllowedMark(mark.type)) continue
        if (mark.type === 'bold') text = `**${text}**`
        else if (mark.type === 'italic') text = `*${text}*`
        else if (mark.type === 'link') {
          const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : null
          if (href && /^https?:\/\//i.test(href)) text = `[${text}](${href})`
        }
      }
      return text
    })
    .join('')
}
