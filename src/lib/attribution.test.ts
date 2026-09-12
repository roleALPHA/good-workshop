import { describe, expect, it } from 'vitest'
import { ATTRIBUTION_MARKDOWN, ATTRIBUTION_TEXT, ROLEALPHA_URL, SOURCE_URL } from './attribution'

/**
 * One line, three surfaces, and the two that are not HTML are the ones that go
 * wrong quietly: Markdown syntax in a plain-text mail reads as punctuation, and
 * a bare URL in a Markdown document is not a link.
 */

describe('the attribution line', () => {
  it('carries the maker and the licence in both shapes', () => {
    for (const line of [ATTRIBUTION_TEXT, ATTRIBUTION_MARKDOWN]) {
      expect(line).toContain('GoodWorkshop')
      expect(line).toContain('roleALPHA')
      expect(line).toContain('AGPL-3.0')
    }
  })

  it('gives the plain-text form addresses somebody can type, and no markup', () => {
    expect(ATTRIBUTION_TEXT).toContain('rolealpha.com')
    expect(ATTRIBUTION_TEXT).toContain('github.com/roleALPHA/good-workshop')
    // A mail client shows `[roleALPHA](https://…)` exactly as written.
    expect(ATTRIBUTION_TEXT).not.toContain('](')
    expect(ATTRIBUTION_TEXT).not.toContain('https://')
  })

  it('gives the Markdown form real links', () => {
    expect(ATTRIBUTION_MARKDOWN).toContain(`[roleALPHA](${ROLEALPHA_URL})`)
    expect(ATTRIBUTION_MARKDOWN).toContain(`[AGPL-3.0](${SOURCE_URL})`)
  })

  it('points the licence at the source, not at a copy of the licence', () => {
    // AGPL section 13 is about the code being reachable by whoever uses the
    // service over the network. A LICENSE file satisfies nobody's right to it.
    expect(SOURCE_URL).not.toMatch(/LICENSE/i)
    expect(SOURCE_URL).toBe('https://github.com/roleALPHA/good-workshop')
  })
})
