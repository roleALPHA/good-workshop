/**
 * A block's prose, in the dialect a block description is stored in.
 *
 * TWO DIALECTS THAT LOOK THE SAME AND ARE NOT. Catalogue prose is written for
 * the public entry page, which renders it with src/cloud/legal/markdown.tsx:
 * `#`, `##` and `###` are headings, and lines soft-wrapped inside a paragraph
 * are joined with a space. A block description is rich text, built by
 * `markdownToRichText`, which mirrors the rich-text allowlist: paragraphs,
 * hard breaks, lists, bold, italic, links -- and NO headings -- and which
 * treats a single newline as a HARD break, because that is what Shift+Enter
 * makes in the row editor.
 *
 * Left alone, neither mismatch fails anywhere. A heading arrives as a
 * paragraph reading "## How to run it" and validates against the block type's
 * schema, so it is not even counted as a dropped description; a paragraph
 * wrapped at eighty columns arrives as a ladder of short lines. The only
 * person who ever sees either is the one who adopted the entry, in their own
 * agenda, days later.
 */

/** `#`, `##`, `###` at the start of a line -- the only headings the site renders. */
const HEADING = /^(#{1,3})\s+(.*)$/u

/** A bullet or a number, with the indent that marks a continuation line. */
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/u

/** Two trailing spaces: an explicit hard break, which both dialects honour. */
const HARD_BREAK = /\s{2,}$/u

export function blockMarkdown(markdown: string): string {
  return normalise(markdown)
}

function normalise(markdown: string): string {
  const lines = markdown.replace(/\r\n?/gu, '\n').trim().split('\n')

  // Each entry is one line of the result. A soft-wrapped continuation is
  // appended to the entry above it rather than starting a new one.
  const out: string[] = []
  let open = false

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.trim() === '') {
      if (out.at(-1) !== '') out.push('')
      open = false
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      // Its own paragraph on both sides, or the bold run would be swallowed
      // into the sentence above or below it.
      if (out.length > 0 && out.at(-1) !== '') out.push('')
      out.push(`**${heading[2]!.trim()}**`)
      out.push('')
      open = false
      continue
    }

    if (LIST_ITEM.test(line)) {
      out.push(line)
      open = true
      continue
    }

    // An explicit hard break ends the line and starts the next one; anything
    // else is a soft wrap and belongs to the line above.
    const previous = out.at(-1)
    if (open && previous !== undefined && previous !== '' && !HARD_BREAK.test(previous)) {
      out[out.length - 1] = `${previous} ${line.trim()}`
      continue
    }

    out.push(HARD_BREAK.test(raw) ? `${line}  ` : line)
    open = true
  }

  return out
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}
