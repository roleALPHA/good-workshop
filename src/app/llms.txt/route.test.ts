import { beforeEach, describe, expect, it, vi } from 'vitest'
import { edition } from '@/server/edition'
import { GET } from './route'
import { llmsTxt } from '@/cloud/site/llms'

/**
 * What an assistant reads when it is asked about GoodWorkshop.
 *
 * Same set-up as src/cloud/site/seo.test.ts: the suite runs as a community
 * build, so the cloud's answer is reached by saying which edition is asked.
 */

const ORIGIN = 'https://goodworkshop.example'

vi.mock('@/server/edition', () => ({ edition: { name: 'cloud' } }))

vi.mock('@gw/catalog', () => ({
  catalog: {
    publishedEntrySlugs: async () => [
      { id: 'm1', locale: 'en', slug: 'dot-voting' },
      { id: 'm1', locale: 'de', slug: 'punktabfrage' },
      { id: 'm2', locale: 'de', slug: 'nur-deutsch' },
    ],
  },
}))

beforeEach(() => {
  vi.stubEnv('GW_APP_URL', ORIGIN)
  ;(edition as { name: string }).name = 'cloud'
})

describe('llms.txt', () => {
  it('starts the way llmstxt.org expects: a title, then a one-line summary', async () => {
    const lines = (await llmsTxt()).split('\n')
    expect(lines[0]).toBe('# GoodWorkshop')
    expect(lines[2]?.startsWith('> ')).toBe(true)
  })

  it('points at the comparison page with an absolute address', async () => {
    // The question this file exists for is "an alternative to SessionLab".
    expect(await llmsTxt()).toContain(`(${ORIGIN}/sessionlab-alternative)`)
  })

  it('counts the methods published in English, and does not list them', () => {
    return llmsTxt().then((text) => {
      // Two entries in English in the mock, one German-only. Counted once each:
      // the other languages are reachable through a page's own hreflang.
      expect(text).toContain('1 method page,')
      expect(text).toContain(`${ORIGIN}/workshop-methods`)
      // Not the list itself. Against the real catalogue that was 501 lines and
      // 41 KB, and every name was guessed from its slug -- `1-2-4-all` came out
      // as "1 2 4 all". A model wants the overview here and the sitemap for the
      // rest.
      expect(text).not.toContain('dot-voting')
      expect(text).not.toContain('punktabfrage')
      expect(text).not.toContain('nur-deutsch')
    })
  })

  it('stays short enough to be read in one go', async () => {
    // llmstxt.org is an overview a model reads before deciding where to look.
    // The first shape of this file grew with the catalogue; this one does not.
    expect((await llmsTxt()).length).toBeLessThan(8000)
  })

  it('never calls the product open source', async () => {
    // The licence is Apache 2.0 with the Commons Clause: source-available.
    expect((await llmsTxt()).toLowerCase()).not.toContain('open source')
  })

  it('answers as plain text in the cloud and 404 in a community build', async () => {
    const cloud = await GET()
    expect(cloud.status).toBe(200)
    expect(cloud.headers.get('content-type')).toContain('text/plain')
    ;(edition as { name: string }).name = 'community'
    expect((await GET()).status).toBe(404)
  })
})
