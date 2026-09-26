import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_MARKDOWN,
  ATTRIBUTION_TEXT,
  GOODWORKSHOP_URL,
  LICENSE_URL,
  ROLEALPHA_URL,
  SOURCE_URL,
} from './attribution'

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

  /**
   * The product name is the way back to the product.
   *
   * An agenda exported as Markdown, a print-out handed round a room, a mail
   * signature: each of them travels to somebody who has never seen this
   * software, and until now the only address on the line belonged to the
   * agency. Somebody who liked what they were reading had nowhere to go.
   */
  it('points the product name at the product', () => {
    expect(GOODWORKSHOP_URL).toBe('https://goodworkshop.org')
    expect(ATTRIBUTION_TEXT).toContain('goodworkshop.org')
    expect(ATTRIBUTION_MARKDOWN).toContain(`[GoodWorkshop](${GOODWORKSHOP_URL})`)
  })

  it('gives the plain-text form addresses somebody can type, and no markup', () => {
    expect(ATTRIBUTION_TEXT).toContain('goodworkshop.org')
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
    // The website points people at the source; it is the same repository, and
    // the two must not drift into naming different places.
    expect(LICENSE_URL.startsWith(`${SOURCE_URL}/`)).toBe(true)
  })
})
