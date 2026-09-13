import {
  isAllowedMark,
  isAllowedNode,
  type RichTextMark,
  type RichTextNode,
  type RichTextValue,
} from './schema'

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

/**
 * The small Markdown dialect used by block descriptions.
 *
 * It deliberately mirrors the rich-text allowlist: paragraphs, hard line
 * breaks, bullet/numbered lists, bold, italic and http(s) links. A single
 * newline is a hard break here because the row editor creates one with
 * Shift+Enter; blank lines still separate paragraphs.
 */
export function markdownToRichText(markdown: string): RichTextValue {
  const lines = markdown.replace(/\r\n?/g, '\n').trim().split('\n')
  const content: RichTextNode[] = []
  let index = 0

  while (index < lines.length) {
    if (lines[index]!.trim() === '') {
      index += 1
      continue
    }

    const marker = listMarker(lines[index]!)
    if (marker) {
      const parsed = parseList(lines, index, marker.indent, marker.ordered)
      content.push(parsed.node)
      index = parsed.next
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && lines[index]!.trim() !== '' && !listMarker(lines[index]!)) {
      paragraphLines.push(lines[index]!.replace(/ {2}$/, ''))
      index += 1
    }
    content.push(paragraph(paragraphLines))
  }

  const doc: RichTextNode = { type: 'doc', content }
  return { format: 'tiptap-doc-v1', doc, text: nodeText(doc) }
}

type ListMarker = { indent: number; ordered: boolean; text: string }

function listMarker(line: string): ListMarker | null {
  const match = /^(\s*)(?:([-+*])|(\d+)\.)\s+(.*)$/.exec(line)
  if (!match) return null
  return {
    indent: match[1]!.replaceAll('\t', '  ').length,
    ordered: match[3] !== undefined,
    text: match[4]!,
  }
}

function parseList(
  lines: string[],
  start: number,
  indent: number,
  ordered: boolean,
): { node: RichTextNode; next: number } {
  const items: RichTextNode[] = []
  let index = start

  while (index < lines.length) {
    const marker = listMarker(lines[index]!)
    if (!marker || marker.indent < indent) break

    if (marker.indent > indent) {
      const parent = items.at(-1)
      if (!parent) break
      const nested = parseList(lines, index, marker.indent, marker.ordered)
      parent.content ??= []
      parent.content.push(nested.node)
      index = nested.next
      continue
    }

    if (marker.ordered !== ordered) break
    items.push({ type: 'listItem', content: [paragraph([marker.text])] })
    index += 1
  }

  return { node: { type: ordered ? 'orderedList' : 'bulletList', content: items }, next: index }
}

function paragraph(lines: string[]): RichTextNode {
  const content: RichTextNode[] = []
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: 'hardBreak' })
    content.push(...parseInline(line))
  })
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function parseInline(source: string, inherited: RichTextMark[] = []): RichTextNode[] {
  const token =
    /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/gi
  const nodes: RichTextNode[] = []
  let cursor = 0

  for (const match of source.matchAll(token)) {
    const offset = match.index ?? 0
    pushText(nodes, source.slice(cursor, offset), inherited)

    if (match[2] !== undefined && match[3] !== undefined) {
      nodes.push(
        ...parseInline(match[2], [...inherited, { type: 'link', attrs: { href: match[3] } }]),
      )
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push(...parseInline((match[4] ?? match[5])!, [...inherited, { type: 'bold' }]))
    } else {
      nodes.push(...parseInline(match[6] ?? match[7] ?? '', [...inherited, { type: 'italic' }]))
    }
    cursor = offset + match[0].length
  }

  pushText(nodes, source.slice(cursor), inherited)
  return nodes
}

function pushText(nodes: RichTextNode[], text: string, marks: RichTextMark[]) {
  if (text === '') return
  nodes.push({ type: 'text', text, ...(marks.length > 0 ? { marks } : {}) })
}

function nodeText(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const separator =
    node.type === 'doc' || node.type === 'listItem' || node.type.endsWith('List') ? '\n' : ''
  return (node.content ?? []).map(nodeText).join(separator)
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
