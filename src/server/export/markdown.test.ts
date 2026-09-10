import { describe, expect, it } from 'vitest'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { renderDayMarkdown } from './markdown'

/**
 * Snapshots against the demo fixture, which is also what the perf budget and
 * the E2E suite use. One shared corpus means a change that alters the export
 * shows up as a diff rather than as a surprise in someone's inbox.
 */
const meta = { title: 'Design Sprint Kickoff', tags: ['design-sprint', 'acme'] }

describe('renderDayMarkdown', () => {
  it('renders the agenda flavour', () => {
    expect(renderDayMarkdown(meta, createDemoDay())).toMatchSnapshot()
  })

  it('renders the outline flavour', () => {
    expect(renderDayMarkdown(meta, createDemoDay(), { flavor: 'outline' })).toMatchSnapshot()
  })

  it('keeps facilitator notes out by default', () => {
    const output = renderDayMarkdown(meta, createDemoDay())
    // The common case for an export is handing it to participants, and notes
    // are explicitly the facilitator's own.
    expect(output).not.toContain('Auftraggeberin')
    expect(renderDayMarkdown(meta, createDemoDay(), { includeFacilitatorNotes: true })).toContain(
      'Auftraggeberin',
    )
  })

  it('marks pinned blocks and overlaps in the table', () => {
    const output = renderDayMarkdown(meta, createDemoDay())
    expect(output).toContain('13:00 🔒')
    expect(output).toContain('⚠ Überschneidung')
  })

  it('escapes pipes so one title cannot break the table', () => {
    const doc = createDemoDay()
    doc.modules[0]!.title = 'A | B'
    expect(renderDayMarkdown(meta, doc)).toContain('A \\| B')
  })

  it('reports the content-versus-breaks split facilitators actually check', () => {
    expect(renderDayMarkdown(meta, createDemoDay())).toMatch(/\d+h \d+m Inhalt, .* Pausen/)
  })

  it('carries the attribution', () => {
    expect(renderDayMarkdown(meta, createDemoDay())).toContain(
      'GoodWorkshop · powered by roleALPHA',
    )
  })
})
