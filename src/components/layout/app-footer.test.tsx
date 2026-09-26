import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GOODWORKSHOP_URL, LICENSE_URL, ROLEALPHA_URL } from '@/lib/attribution'
import pkg from '../../../package.json'
import { AppFooter } from './app-footer'

const release = `v${pkg.version}`
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * No `renderWithIntl` here, deliberately: this footer has no translated string
 * in it, and rendering it through the provider would suggest it does.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the footer', () => {
  it('links the product, the maker and the licence, each leaving the application', () => {
    render(<AppFooter />)

    const product = screen.getByRole('link', { name: 'GoodWorkshop' })
    expect(product).toHaveAttribute('href', GOODWORKSHOP_URL)

    const maker = screen.getByRole('link', { name: 'roleALPHA' })
    expect(maker).toHaveAttribute('href', ROLEALPHA_URL)

    const licence = screen.getByRole('link', { name: 'Apache-2.0 + Commons Clause' })
    expect(licence).toHaveAttribute('href', LICENSE_URL)

    for (const link of [product, maker, licence]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
  })

  it('still says who made it', () => {
    const { container } = render(<AppFooter />)
    expect(container.textContent).toContain('GoodWorkshop · powered by roleALPHA')
  })
  it('names the release that is serving the page', () => {
    vi.stubEnv('GW_BUILD', `${release}-414f9e2`)
    const { container } = render(<AppFooter />)
    expect(container.textContent).toContain(release)
  })

  // What a preview pulling the `main` tag showed: compose passes the .env value
  // in as GW_VERSION, and the footer printed the tag instead of a version.
  it('shows a version number, not the tag the image was pulled by', () => {
    vi.stubEnv('GW_VERSION', 'main')
    vi.stubEnv('GW_BUILD', 'main-414f9e2')
    const { container } = render(<AppFooter />)
    expect(container.textContent).toMatch(new RegExp(`${escaped(release)}\\+main-414f9e2$`))
  })

  it('says dev rather than nothing when no image built it', () => {
    vi.stubEnv('GW_BUILD', undefined)
    const { container } = render(<AppFooter />)
    expect(container.textContent).toContain('dev')
  })

  /**
   * The attribution sentence is a constant on purpose -- see @/lib/attribution.
   * The version sits AFTER it, not inside it, so that no later edit folds a
   * value read from the environment into a line that claims to be fixed.
   */
  it('puts the version after the attribution, not inside it', () => {
    vi.stubEnv('GW_BUILD', `${release}-414f9e2`)
    const { container } = render(<AppFooter />)
    expect(container.textContent).toMatch(
      new RegExp(
        `GoodWorkshop \u00b7 powered by roleALPHA \u00b7 Apache-2\\.0 \\+ Commons Clause \u00b7 ${escaped(release)}$`,
      ),
    )
  })
})
