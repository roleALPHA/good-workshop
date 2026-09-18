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
    document.querySelector('script[data-website-id]')?.remove()
  })

  // React hoists a <script src> into the document head rather than leaving it
  // where it was rendered, so that is where it has to be looked for.
  const loaded = () => document.querySelector('script[data-website-id]')

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

  it('names the site it counts for', () => {
    process.env.GW_ANALYTICS_SCRIPT_URL = 'https://analytics.example.com/script.js'
    process.env.GW_ANALYTICS_WEBSITE_ID = 'abc-123'
    render(<Analytics />)
    const script = loaded()
    expect(script?.getAttribute('src')).toBe('https://analytics.example.com/script.js')
    expect(script?.getAttribute('data-website-id')).toBe('abc-123')
  })
})
