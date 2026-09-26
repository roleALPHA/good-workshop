import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LegalMarkdown, parseLegalMarkdown } from './markdown'

describe('parseLegalMarkdown', () => {
  it('reads headings, paragraphs and both kinds of list', () => {
    expect(
      parseLegalMarkdown(
        [
          '<!-- note for editors -->',
          '# Titel',
          '',
          'Erster Satz',
          'geht weiter.',
          '',
          '## Abschnitt',
          '- eins',
          '- zwei',
          '  fortgesetzt',
          '1. erstens',
          '2. zweitens',
        ].join('\n'),
      ),
    ).toEqual([
      { kind: 'heading', level: 1, text: 'Titel' },
      { kind: 'paragraph', text: 'Erster Satz geht weiter.' },
      { kind: 'heading', level: 2, text: 'Abschnitt' },
      { kind: 'list', ordered: false, items: ['eins', 'zwei fortgesetzt'] },
      { kind: 'list', ordered: true, items: ['erstens', 'zweitens'] },
    ])
  })
})

/**
 * The catalogue writes tables, and this renderer swallowed them.
 *
 * `| Attribute | Detail |` fell through to the paragraph branch, where every
 * line of the table was joined with a space -- so a method page on
 * goodworkshop.org showed one long run of pipes and dashes instead of the
 * table. It is the second reader of this parser (src/cloud/site/method.tsx),
 * and the legal texts it was written for happen not to use tables.
 */
describe('tables', () => {
  const table = [
    '| Attribute | Detail |',
    '|---|---|',
    '| Group size | 5–15 per circle |',
    '| Duration | 45 min |',
  ].join('\n')

  it('reads a table as a table, not as a paragraph', () => {
    expect(parseLegalMarkdown(table)).toEqual([
      {
        kind: 'table',
        header: ['Attribute', 'Detail'],
        rows: [
          ['Group size', '5–15 per circle'],
          ['Duration', '45 min'],
        ],
      },
    ])
  })

  it('takes the alignment row in the shapes people write it', () => {
    for (const rule of ['|---|---|', '| --- | --- |', '|:---|---:|', '| :-: | --- |']) {
      const parsed = parseLegalMarkdown(['| A | B |', rule, '| 1 | 2 |'].join('\n'))
      expect(parsed, rule).toEqual([{ kind: 'table', header: ['A', 'B'], rows: [['1', '2']] }])
    }
  })

  it('leaves a pipe that is not a table alone', () => {
    // A sentence may contain a pipe. Without the alignment row underneath it,
    // a line starting with one is still just a line.
    expect(parseLegalMarkdown('Nutze a | b, um zu trennen.')).toEqual([
      { kind: 'paragraph', text: 'Nutze a | b, um zu trennen.' },
    ])
  })

  it('renders it as a real table, with the header in header cells', () => {
    render(<LegalMarkdown source={table} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Attribute' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '5–15 per circle' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('renders inline markup inside a cell, and no markup from one', () => {
    render(
      <LegalMarkdown
        source={['| A | B |', '|---|---|', '| **fett** | <b>nein</b> |'].join('\n')}
      />,
    )
    expect(screen.getByText('fett').tagName).toBe('STRONG')
    expect(screen.getByRole('cell', { name: '<b>nein</b>' })).toBeInTheDocument()
  })
})

describe('LegalMarkdown', () => {
  it('renders bold and safe links', () => {
    render(
      <LegalMarkdown source="**Wichtig:** siehe [AGB](/agb), [Mail](mailto:a@b.at) und [extern](https://example.com)." />,
    )
    expect(screen.getByText('Wichtig:').tagName).toBe('STRONG')
    expect(screen.getByRole('link', { name: 'AGB' })).toHaveAttribute('href', '/agb')
    expect(screen.getByRole('link', { name: 'Mail' })).toHaveAttribute('href', 'mailto:a@b.at')
    expect(screen.getByRole('link', { name: 'extern' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it.each([
    ['javascript:alert(1)'],
    ['http://insecure.example'],
    ['//evil.example'],
    ['data:text/html,x'],
  ])('refuses to link to %s and keeps the words', (href) => {
    render(<LegalMarkdown source={`vor [Linktext](${href}) nach`} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/Linktext/)).toBeInTheDocument()
  })

  it('never turns text into markup', () => {
    const { container } = render(<LegalMarkdown source={'<script>alert(1)</script> <b>x</b>'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })
})
