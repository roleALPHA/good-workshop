import { Fragment, type ReactNode } from 'react'
import { isAllowedMark, isAllowedNode, type RichTextNode, type RichTextValue } from './schema'

/**
 * Renders a stored description without booting an editor.
 *
 * The agenda can hold sixty-plus rows; sixty live ProseMirror instances would
 * blow the interaction budget. Rows therefore render this static output and
 * only swap to a real editor on focus (desktop) -- on phones, never.
 *
 * Unknown nodes and marks are dropped rather than throwing: reads are always
 * lenient, because a workshop that will not open is worse than a paragraph that
 * lost its formatting.
 */
export function RichText({ value, className }: { value: RichTextValue; className?: string }) {
  return <div className={className}>{renderChildren(value.doc.content)}</div>
}

function renderChildren(nodes: RichTextNode[] | undefined): ReactNode {
  if (!nodes) return null
  return nodes.map((node, i) => <Fragment key={i}>{renderNode(node)}</Fragment>)
}

function renderNode(node: RichTextNode): ReactNode {
  if (!isAllowedNode(node.type)) return null

  switch (node.type) {
    case 'text':
      return applyMarks(node)
    case 'hardBreak':
      return <br />
    case 'paragraph':
      return <p className="not-last:mb-1.5">{renderChildren(node.content)}</p>
    case 'bulletList':
      return <ul className="my-1.5 list-disc space-y-0.5 pl-5">{renderChildren(node.content)}</ul>
    case 'orderedList':
      return (
        <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{renderChildren(node.content)}</ol>
      )
    case 'listItem':
      return <li className="[&>p]:mb-0">{renderChildren(node.content)}</li>
    case 'doc':
      return renderChildren(node.content)
    default:
      return null
  }
}

function applyMarks(node: RichTextNode): ReactNode {
  let out: ReactNode = node.text ?? ''

  for (const mark of node.marks ?? []) {
    if (!isAllowedMark(mark.type)) continue

    if (mark.type === 'bold') out = <strong className="font-semibold">{out}</strong>
    else if (mark.type === 'italic') out = <em>{out}</em>
    else if (mark.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : undefined
      // Only http(s) survives: a stored `javascript:` href is the one way a
      // description could become executable.
      const safe = href && /^https?:\/\//i.test(href) ? href : undefined
      out = safe ? (
        <a
          href={safe}
          rel="noopener noreferrer"
          target="_blank"
          className="underline underline-offset-2"
        >
          {out}
        </a>
      ) : (
        out
      )
    }
  }

  return out
}
