import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LICENSE_URL, ROLEALPHA_URL } from '@/lib/attribution'
import { AppFooter } from './app-footer'

/**
 * No `renderWithIntl` here, deliberately: this footer has no translated string
 * in it, and rendering it through the provider would suggest it does.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the footer', () => {
  it('links the maker and the licence, each leaving the application', () => {
    render(<AppFooter />)

    const maker = screen.getByRole('link', { name: 'roleALPHA' })
    expect(maker).toHaveAttribute('href', ROLEALPHA_URL)

    const licence = screen.getByRole('link', { name: 'Apache-2.0 + Commons Clause' })
    expect(licence).toHaveAttribute('href', LICENSE_URL)

    for (const link of [maker, licence]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
  })

  it('still says who made it', () => {
    const { container } = render(<AppFooter />)
    expect(container.textContent).toContain('GoodWorkshop · powered by roleALPHA')
  })
  it('names the build that is serving the page', () => {
    vi.stubEnv('GW_VERSION', 'v0.3.1')
    const { container } = render(<AppFooter />)
    expect(container.textContent).toContain('v0.3.1')
  })

  it('says dev rather than nothing when no image built it', () => {
    vi.stubEnv('GW_VERSION', undefined)
    const { container } = render(<AppFooter />)
    expect(container.textContent).toContain('dev')
  })

  /**
   * The attribution sentence is a constant on purpose -- see @/lib/attribution.
   * The version sits AFTER it, not inside it, so that no later edit folds a
   * value read from the environment into a line that claims to be fixed.
   */
  it('puts the build after the attribution, not inside it', () => {
    vi.stubEnv('GW_VERSION', 'v0.3.1')
    const { container } = render(<AppFooter />)
    expect(container.textContent).toMatch(
      /GoodWorkshop \u00b7 powered by roleALPHA \u00b7 Apache-2\.0 \+ Commons Clause \u00b7 v0\.3\.1$/,
    )
  })
})
