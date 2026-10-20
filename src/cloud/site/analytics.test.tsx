import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Analytics } from './analytics'

/**
 * What gets loaded into a visitor's browser, and when nothing does.
 *
 * The default matters more than the feature: an installation that configures no
 * measurement must send no third-party script at all, and the content security
 * policy in src/middleware.ts is written on that assumption.
 */

describe('reach measurement', () => {
  afterEach(() => {
    delete process.env.GW_ANALYTICS_SCRIPT_URL
    delete process.env.GW_ANALYTICS_WEBSITE_ID
    document.querySelectorAll('script[data-website-id]').forEach((s) => s.remove())
  })

  // React hoists a <script src> into the document head rather than leaving it
  // where it was rendered, so that is where it has to be looked for.
  const loaded = () => document.querySelector('script[data-website-id]')
  const all = () => [...document.querySelectorAll('script[data-website-id]')]

  it('loads nothing while it is not configured', () => {
    render(<Analytics />)
    expect(loaded()).toBeNull()
  })

  it('loads nothing when only half of it is configured', () => {
    // A script without a website id measures nothing and still costs the
    // visitor a request to a third party.
    process.env.GW_ANALYTICS_SCRIPT_URL = 'https://analytics.example.com/script.js'
    render(<Analytics />)
    expect(loaded()).toBeNull()
  })

  // One test, not two: React remembers a script it has hoisted once and does
  // not insert it again for a later render in the same document.
  it('names the site it counts for, and loads the recorder beside the counter', () => {
    // The recorder sends its replays next to the counter's page views and
    // waits for the counter's session; from anywhere else it records nothing.
    process.env.GW_ANALYTICS_SCRIPT_URL = 'https://analytics.example.com/script.js'
    process.env.GW_ANALYTICS_WEBSITE_ID = 'abc-123'
    render(<Analytics />)
    expect(all().map((s) => [s.getAttribute('src'), s.getAttribute('data-website-id')])).toEqual([
      ['https://analytics.example.com/script.js', 'abc-123'],
      ['https://analytics.example.com/recorder.js', 'abc-123'],
    ])
  })

  it.each([
    'src/app/(site)/registrieren/page.cloud.tsx',
    'src/app/(site)/registrieren/bestaetigen/page.cloud.tsx',
  ])('keeps %s out of the replay', (page) => {
    // The recorder is loaded on every public page and survives a client-side
    // navigation, so the form cannot be protected by not loading it there.
    // rrweb skips anything with this class; the privacy policy relies on it.
    expect(readFileSync(page, 'utf8')).toMatch(/className="rr-block /)
  })
})
