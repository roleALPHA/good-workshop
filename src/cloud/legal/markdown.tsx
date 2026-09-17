import type { ReactNode } from 'react'

/**
 * The Markdown the legal texts are written in, rendered to React -- and nothing
 * more of Markdown than they use.
 *
 * Headings (#, ##, ###), paragraphs, bullet and numbered lists, **bold** and
 * [links](https://…). No HTML passes through: every character becomes a text
 * node, so a legal text edited by somebody outside the team cannot put markup
 * or script on the page. Links go to https, mailto and the site's own paths,
 * and nowhere else.
 */

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }

export function parseLegalMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    if (list) blocks.push({ kind: 'list', ...list })
    paragraph = []
    list = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    // An HTML comment line is a note for whoever edits the file, not content.
    if (line === '' || (line.startsWith('<!--') && line.endsWith('-->'))) {
      flush()
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!,
      })
      continue
    }

    const item = /^(?:([-*])|(\d+)\.)\s+(.+)$/.exec(line)
    if (item) {
      const ordered = item[2] !== undefined
      if (paragraph.length || (list && list.ordered !== ordered)) flush()
      list ??= { ordered, items: [] }
      list.items.push(item[3]!)
      continue
    }

    if (list) {
      // A continuation line belongs to the list item above it.
      const last = list.items.length - 1
      list.items[last] = `${list.items[last]} ${line}`
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

const SAFE_HREF = /^(https:\/\/|mailto:|\/(?!\/))/

/** Inline **bold** and [text](href). Everything else is text. */
export function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let key = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1] !== undefined) {
      parts.push(<strong key={key++}>{match[1]}</strong>)
    } else if (SAFE_HREF.test(match[3]!)) {
      parts.push(
        <a key={key++} href={match[3]} className="underline underline-offset-2">
          {match[2]}
        </a>,
      )
    } else {
      parts.push(match[2]!)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function LegalMarkdown({ source }: { source: string }) {
  return (
    <div className="space-y-4 text-[16px] leading-relaxed">
      {parseLegalMarkdown(source).map((block, index) => {
        if (block.kind === 'heading') {
          const Tag = (['h1', 'h2', 'h3'] as const)[block.level - 1]!
          const size = ['text-2xl mt-2', 'text-xl mt-8', 'text-[17px] mt-6'][block.level - 1]
          return (
            <Tag key={index} className={`${size} font-semibold tracking-tight`}>
              {renderInline(block.text)}
            </Tag>
          )
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag
              key={index}
              className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-6`}
            >
              {block.items.map((item, i) => (
                <li key={i}>{renderInline(item)}</li>
              ))}
            </Tag>
          )
        }
        return <p key={index}>{renderInline(block.text)}</p>
      })}
    </div>
  )
}
