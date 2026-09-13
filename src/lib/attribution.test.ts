import { describe, expect, it } from 'vitest'
import { ATTRIBUTION_MARKDOWN, ATTRIBUTION_TEXT, LICENSE_URL, ROLEALPHA_URL } from './attribution'

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
      expect(line).toContain('Apache-2.0 + Commons Clause')
    }
  })

  /**
   * The Commons Clause requires that any licence notice mention it. A label
   * that said only "Apache-2.0" would promise rights this project does not
   * grant, which is worse than saying nothing.
   */
  it('never names Apache-2.0 without the Commons Clause', () => {
    for (const line of [ATTRIBUTION_TEXT, ATTRIBUTION_MARKDOWN]) {
      expect(line).not.toMatch(/Apache-2\.0(?! \+ Commons Clause)/)
    }
  })

  it('gives the plain-text form addresses somebody can type, and no markup', () => {
    expect(ATTRIBUTION_TEXT).toContain('rolealpha.com')
    expect(ATTRIBUTION_TEXT).toContain('github.com/roleALPHA/good-workshop/blob/main/LICENSE')
    // A mail client shows `[roleALPHA](https://…)` exactly as written.
    expect(ATTRIBUTION_TEXT).not.toContain('](')
    expect(ATTRIBUTION_TEXT).not.toContain('https://')
  })

  it('gives the Markdown form real links', () => {
    expect(ATTRIBUTION_MARKDOWN).toContain(`[roleALPHA](${ROLEALPHA_URL})`)
    expect(ATTRIBUTION_MARKDOWN).toContain(`[Apache-2.0 + Commons Clause](${LICENSE_URL})`)
  })

  it('points the licence at the terms themselves', () => {
    expect(LICENSE_URL).toBe('https://github.com/roleALPHA/good-workshop/blob/main/LICENSE')
  })
})
