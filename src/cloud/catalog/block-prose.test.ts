import { describe, expect, it } from 'vitest'
import { blockMarkdown } from './block-prose'

/**
 * Two Markdown dialects that do not line up, as a table.
 *
 * A method's prose is written for the public page, which renders it with
 * `src/cloud/legal/markdown.tsx`: headings, and soft-wrapped lines joined into
 * a paragraph. A block description is stored as rich text and comes from
 * `markdownToRichText`, which has no headings at all and turns a single
 * newline into a HARD break.
 *
 * Neither mismatch fails anywhere. A heading arrives as a paragraph reading
 * "## How to run it", and it validates, so it is not even counted as dropped;
 * a paragraph wrapped at 80 columns arrives as a ladder of short lines. Both
 * are only ever visible to the person who adopted the method, in their own
 * agenda, which is the worst place to find out.
 */

const prose = (markdown: string) => blockMarkdown(markdown)

describe('what the block description dialect can carry', () => {
  it('turns a heading into a bold line, because there are no headings', () => {
    expect(prose('## How to run it\n\nAsk everyone.')).toBe('**How to run it**\n\nAsk everyone.')
    expect(prose('# One\n\n### Three')).toBe('**One**\n\n**Three**')
  })

  it('does not mistake a hash inside a line for a heading', () => {
    expect(prose('Room #3 is free.')).toBe('Room #3 is free.')
  })

  it('joins a soft-wrapped paragraph, which would otherwise be a hard break', () => {
    expect(prose('One line\nand its continuation.')).toBe('One line and its continuation.')
  })

  it('keeps a blank line as a paragraph break', () => {
    expect(prose('First.\n\nSecond.')).toBe('First.\n\nSecond.')
  })

  it('keeps list items apart while joining what wraps inside one', () => {
    // Joining these would turn a list into one long bullet; splitting the
    // continuation would turn a wrapped item into two.
    expect(prose('- one item\n  wrapped over two lines\n- second item')).toBe(
      '- one item wrapped over two lines\n- second item',
    )
    expect(prose('1. first\n2. second')).toBe('1. first\n2. second')
  })

  it('keeps an explicit hard break, which is two trailing spaces', () => {
    expect(prose('Line one.  \nLine two.')).toBe('Line one.  \nLine two.')
  })

  it('leaves the marks the dialect shares alone', () => {
    expect(prose('**bold**, *italic* and <https://example.org>')).toBe(
      '**bold**, *italic* and <https://example.org>',
    )
  })
})
