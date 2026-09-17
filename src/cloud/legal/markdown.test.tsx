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
