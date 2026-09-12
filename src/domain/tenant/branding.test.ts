import { describe, expect, it } from 'vitest'
import { contrastRatio, oklchToRgb, parseHex, rgbToOklch } from '@/lib/color/oklch'
import { BrandError, brandCss, brandSwatch, readBrand } from './branding'

/**
 * The promise this module makes: whatever hex a tenant types, the interface
 * stays readable. Worth testing across the whole hue circle rather than on a
 * favourite colour, because the failure mode is somebody's install looking
 * broken and nobody here ever seeing it.
 */

describe('readBrand', () => {
  it('keeps the hue the tenant asked for', () => {
    const brand = readBrand('#7c3aed')
    const wanted = rgbToOklch(parseHex('#7c3aed')!)
    expect(brand.hue).toBeCloseTo(wanted.h, 4)
  })

  it('caps a chroma that would glow rather than brand', () => {
    const brand = readBrand('#ff00ff')
    expect(brand.chroma).toBeLessThanOrEqual(0.22)
  })

  it('refuses grey, which has no hue to build on', () => {
    expect(() => readBrand('#808080')).toThrow(BrandError)
    expect(() => readBrand('#ffffff')).toThrow('brand.grey')
  })

  it('refuses something that is not a colour at all', () => {
    expect(() => readBrand('rebeccapurple')).toThrow('brand.notHex')
  })

  it('offers a colour that would work when it refuses one that will not', () => {
    try {
      readBrand('#000000')
      expect.unreachable('grey must be refused')
    } catch (error) {
      expect((error as BrandError).suggestion).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('the generated ramp', () => {
  // Every 5° around the circle at full saturation: the hues most likely to
  // break contrast are the bright ones (yellow, cyan) that a corporate palette
  // is quite likely to contain.
  const hues = Array.from({ length: 72 }, (_, i) => i * 5)

  it.each(hues)('stays readable at hue %i', (hue) => {
    const hex = hexAt(hue)
    const brand = readBrand(hex)

    for (const [name, fg, bg] of pairsOf(brand)) {
      expect(contrastRatio(fg, bg), `${hex} ${name}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('brandCss', () => {
  it('emits only the two axes a tenant owns', () => {
    const css = brandCss(readBrand('#7c3aed'))!
    expect(css).toMatch(/--brand-h:/)
    expect(css).toMatch(/--brand-c:/)
    // Lightness stays in the stylesheet. A second copy of the ramp here would
    // drift from the one that actually paints the page.
    expect(css).not.toMatch(/oklch/)
  })

  it('says nothing when a tenant has set nothing', () => {
    expect(brandCss(null)).toBeNull()
  })
})

describe('brandSwatch', () => {
  it('gives back something that can be shown', () => {
    expect(brandSwatch(readBrand('#7c3aed'))).toMatch(/^#[0-9a-f]{6}$/)
  })
})

/** A saturated colour at a given hue, as a tenant would type it. */
function hexAt(hue: number): string {
  const rgb = oklchToRgb({ l: 0.6, c: 0.15, h: hue })
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

/** The pairs the stylesheet actually puts on top of each other. */
function pairsOf(brand: { hue: number; chroma: number }) {
  const paint = (l: number, c: number) => oklchToRgb({ l, c, h: brand.hue })
  return [
    ['hell: Text auf Akzent', paint(0.995, 0.005), paint(0.545, brand.chroma)],
    ['hell: gedämpft', paint(0.4, 0.11), paint(0.965, 0.028)],
    ['dunkel: Text auf Akzent', paint(0.185, 0.02), paint(0.66, brand.chroma * 0.88)],
    ['dunkel: gedämpft', paint(0.885, 0.055), paint(0.285, 0.055)],
  ] as const
}
