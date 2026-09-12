import { describe, expect, it } from 'vitest'
import { createDemoDay } from '@/features/agenda/fixtures/day-fixture'
import { renderDayMarkdown } from './markdown'
import { ATTRIBUTION_MARKDOWN } from '@/lib/attribution'

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

  /**
   * The filter used to name ONE field: `key === 'facilitator_notes'`.
   *
   * That was right for as long as `facilitator_notes` was the only field
   * carrying `x-gw.private`, and wrong the moment a second one appeared --
   * which is a schema edit, not a code change, so nothing would have failed.
   * A block type declaring a private field in this installation's own schema
   * would have gone out to participants in the handover.
   */
  it('keeps ANY private field out, not only the one it was named after', () => {
    const day = createDemoDay()
    const [typeId, type] = Object.entries(day.moduleTypes)[0]!
    const schema = JSON.parse(JSON.stringify(type.jsonSchema)) as {
      properties: Record<string, unknown>
    }
    schema.properties.client_budget = {
      type: 'string',
      title: 'Budget',
      'x-gw': { group: 'Moderation', order: 9, cols: 12, private: true },
    }
    day.moduleTypes[typeId] = { ...type, jsonSchema: schema }

    const target = Object.values(day.modules).find((m) => m.moduleTypeId === typeId)!
    target.desc.client_budget = 'Geheim 12.000'

    expect(renderDayMarkdown(meta, day, { includeDescriptions: true })).not.toContain(
      'Geheim 12.000',
    )
  })

  it('keeps facilitator notes out by default', () => {
    const output = renderDayMarkdown(meta, createDemoDay())
    // The common case for an export is handing it to participants, and notes
    // are explicitly the facilitator's own.
    expect(output).not.toContain('Auftraggeberin')
    expect(renderDayMarkdown(meta, createDemoDay(), { includePrivateFields: true })).toContain(
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

  it('neutralises HTML that a downstream renderer would execute', () => {
    // The delivery path is clean -- text/markdown, attachment, a slug-only
    // filename. The risk is what happens next: exports get pasted into wikis,
    // static site generators and chat tools, and a good many of those render
    // raw HTML inside Markdown by default.
    const doc = createDemoDay()
    doc.modules[0]!.title = '<img src=x onerror=alert(1)>'
    const output = renderDayMarkdown(meta, doc)

    expect(output).not.toContain('<img src=x onerror=alert(1)>')
    expect(output).toContain('&lt;img')
  })

  it('reports the content-versus-breaks split facilitators actually check', () => {
    expect(renderDayMarkdown(meta, createDemoDay())).toMatch(/\d+h \d+m Inhalt, .* Pausen/)
  })

  it('carries the attribution, and here the two addresses are links', () => {
    const out = renderDayMarkdown(meta, createDemoDay())
    expect(out).toContain(ATTRIBUTION_MARKDOWN)
    // A Markdown export is a document somebody pastes somewhere, so the
    // addresses go in as links rather than as bare text the way a mail needs.
    expect(out).toContain('[roleALPHA](https://rolealpha.com)')
    expect(out).toContain('[AGPL-3.0](https://github.com/roleALPHA/good-workshop)')
  })
})
