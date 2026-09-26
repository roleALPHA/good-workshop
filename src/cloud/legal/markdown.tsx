import type { ReactNode } from 'react'

/**
 * The Markdown the legal texts are written in, rendered to React -- and nothing
 * more of Markdown than they use.
 *
 * Headings (#, ##, ###), paragraphs, bullet and numbered lists, tables, **bold**
 * and [links](https://…). No HTML passes through: every character becomes a text
 * node, so a legal text edited by somebody outside the team cannot put markup
 * or script on the page. Links go to https, mailto and the site's own paths,
 * and nowhere else.
 *
 * Tables are here for the second reader of this parser, the Discover catalogue
 * (src/cloud/site/method.tsx). A method's "At a glance" is a table, and without
 * this it arrived on the page as one long run of pipes and dashes -- the
 * paragraph branch joining every row with a space. The legal texts do not use
 * tables; that is why it took a screenshot from the live site to notice.
 */

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }

/**
 * `| a | b |` -> `['a', 'b']`.
 *
 * The outer pipes are optional in Markdown and the inner ones are the
 * separator, so the split is done on the trimmed inside rather than on the
 * whole line -- otherwise every row gains an empty cell at each end.
 */
const cells = (line: string): string[] =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim())

/**
 * The row of dashes under a table's header, in the shapes people write it:
 * `|---|---|`, `| --- | --- |`, and with colons for alignment.
 *
 * Alignment is parsed but not kept: this renderer has one table style, and a
 * column that is right-aligned in the source and left-aligned on the page is a
 * smaller surprise than a table that refuses to render because of a colon.
 */
const isAlignmentRow = (line: string): boolean =>
  /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line) ||
  /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(line)

export function parseLegalMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  /** The table above consumed these lines; the loop walks past them. */
  let skipUntil = 0

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    if (list) blocks.push({ kind: 'list', ...list })
    paragraph = []
    list = null
  }

  for (const [index, raw] of lines.entries()) {
    if (index < skipUntil) continue
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

    // A table, and only with the alignment row under it: a sentence is allowed
    // to contain a pipe, and one that does is still a sentence.
    if (line.startsWith('|') && isAlignmentRow(lines[index + 1]?.trim() ?? '')) {
      flush()
      const header = cells(line)
      const rows: string[][] = []
      let at = index + 2
      while (at < lines.length && lines[at]!.trim().startsWith('|')) {
        rows.push(cells(lines[at]!.trim()))
        at += 1
      }
      blocks.push({ kind: 'table', header, rows })
      skipUntil = at
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
        if (block.kind === 'table') {
          return (
            // Scrollable rather than squeezed: a method's "At a glance" has two
            // columns on a desktop and the same two on a phone, where forcing
            // them into 360px turns every cell into a column of single words.
            <div key={index} className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[22rem] border-collapse text-[15px]">
                <thead>
                  <tr>
                    {block.header.map((cell, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                      >
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="border-b border-[var(--border)] px-3 py-2 align-top">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return <p key={index}>{renderInline(block.text)}</p>
      })}
    </div>
  )
}
