import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  fitChroma,
  inSrgbGamut,
  oklchToRgb,
  parseHex,
  rgbToOklch,
  toHex,
} from './oklch'

/**
 * The arithmetic a tenant's brand colour passes through.
 *
 * Worth a table rather than a couple of spot checks: everything downstream --
 * the generated ramp, the gamut fit, the contrast guarantee -- is only as
 * trustworthy as the round trip.
 */

describe('parseHex', () => {
  it.each([
    ['#000000', { r: 0, g: 0, b: 0 }],
    ['#ffffff', { r: 1, g: 1, b: 1 }],
    ['ff0000', { r: 1, g: 0, b: 0 }],
    ['#FF8000', { r: 1, g: 128 / 255, b: 0 }],
  ])('reads %s', (hex, expected) => {
    expect(parseHex(hex)).toEqual(expected)
  })

  it.each(['', '#abc', '#12345', '#1234567', 'rebeccapurple', '#gggggg'])('refuses %s', (input) => {
    expect(parseHex(input)).toBeNull()
  })
})

describe('the round trip', () => {
  it.each(['#000000', '#ffffff', '#7c3aed', '#ff0000', '#00ff00', '#0000ff', '#3b82f6', '#808080'])(
    'survives %s',
    (hex) => {
      const back = toHex(oklchToRgb(rgbToOklch(parseHex(hex)!)))
      expect(back).toBe(hex.toLowerCase())
    },
  )

  it('reports a grey as having no hue rather than a random one', () => {
    // atan2 on floating-point noise would otherwise pick a colour, and the
    // ramp would build a whole palette out of it.
    expect(rgbToOklch(parseHex('#808080')!).h).toBe(0)
    expect(rgbToOklch(parseHex('#808080')!).c).toBeLessThan(1e-6)
  })
})

describe('fitChroma', () => {
  it('leaves a colour that already fits alone', () => {
    const c = fitChroma(0.55, 0.1, 262)
    expect(c).toBe(0.1)
  })

  it('reduces one that does not, rather than letting it be clipped', () => {
    // A very light, very saturated colour has no sRGB representation. The
    // browser would clip it per channel, which moves the LIGHTNESS -- the one
    // property the whole ramp depends on holding still.
    const fitted = fitChroma(0.97, 0.4, 140)
    expect(fitted).toBeLessThan(0.4)
    expect(inSrgbGamut({ l: 0.97, c: fitted, h: 140 })).toBe(true)
  })

  it('finds something displayable at every hue and every ramp lightness', () => {
    for (let h = 0; h < 360; h += 15) {
      for (const l of [0.185, 0.285, 0.43, 0.545, 0.66, 0.885, 0.965, 0.995]) {
        const fitted = fitChroma(l, 0.4, h)
        expect(inSrgbGamut({ l, c: fitted, h }), `l=${l} h=${h}`).toBe(true)
      }
    }
  })
})

describe('contrastRatio', () => {
  it.each([
    ['#000000', '#ffffff', 21],
    ['#ffffff', '#ffffff', 1],
    ['#777777', '#ffffff', 4.48],
  ])('%s against %s is about %s', (a, b, expected) => {
    expect(contrastRatio(parseHex(a)!, parseHex(b)!)).toBeCloseTo(expected, 1)
  })

  it('does not care which way round it is asked', () => {
    const a = parseHex('#7c3aed')!
    const b = parseHex('#ffffff')!
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })
})
