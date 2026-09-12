import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ROLEALPHA_URL, SOURCE_URL } from '@/lib/attribution'
import { AppFooter } from './app-footer'

/**
 * No `renderWithIntl` here, deliberately: this footer has no translated string
 * in it, and rendering it through the provider would suggest it does.
 */

describe('the footer', () => {
  it('links the maker and the licence, each leaving the application', () => {
    render(<AppFooter />)

    const maker = screen.getByRole('link', { name: 'roleALPHA' })
    expect(maker).toHaveAttribute('href', ROLEALPHA_URL)

    const licence = screen.getByRole('link', { name: 'AGPL-3.0' })
    expect(licence).toHaveAttribute('href', SOURCE_URL)

    for (const link of [maker, licence]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
  })

  it('still says who made it', () => {
    const { container } = render(<AppFooter />)
    expect(container.textContent).toContain('GoodWorkshop · powered by roleALPHA')
  })
})
