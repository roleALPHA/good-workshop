import { describe, expect, it } from 'vitest'
import { markdownToRichText, richTextToMarkdown } from './markdown'

describe('description Markdown', () => {
  it('turns hyphen lines into a bullet list', () => {
    const value = markdownToRichText('- Erster Punkt\n- Zweiter Punkt')

    expect(value.doc.content).toEqual([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Erster Punkt' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zweiter Punkt' }] }],
          },
        ],
      },
    ])
    expect(value.text).toBe('Erster Punkt\nZweiter Punkt')
  })

  it('keeps line breaks and the supported inline notation', () => {
    const value = markdownToRichText(
      'Ein **wichtiger** Satz\nmit *Betonung* und [Link](https://example.com)',
    )

    expect(value.doc.content?.[0]?.content).toContainEqual({ type: 'hardBreak' })
    expect(richTextToMarkdown(value)).toBe(
      'Ein **wichtiger** Satz  \nmit *Betonung* und [Link](https://example.com)',
    )
  })

  it('round-trips nested lists emitted by the exporter', () => {
    const markdown = '- Außen\n  1. Innen\n- Danach'
    expect(richTextToMarkdown(markdownToRichText(markdown))).toBe(markdown)
  })
})
