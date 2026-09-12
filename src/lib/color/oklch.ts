/**
 * sRGB ↔ OKLCH, and WCAG contrast.
 *
 * Written out rather than pulled in as a dependency: it is about sixty lines
 * of fixed, published matrices, and the alternative is a package in the
 * dependency tree of a self-hosted product for arithmetic that will never
 * change.
 *
 * OKLCH is the space the whole design system is expressed in, and the reason
 * is perceptual lightness. Fixing L across a ramp keeps the steps equally
 * bright to the eye, which is what makes a tenant's brand colour swappable
 * without re-checking every surface it lands on.
 */

export type Oklch = { l: number; c: number; h: number }
export type Rgb = { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1]!, 16)
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const chroma = Math.sqrt(a * a + bb * bb)
  // Hue of a grey is meaningless; reporting 0 keeps it out of the ramp rather
  // than letting floating-point noise pick a colour.
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360

  return { l: lightness, c: chroma, h: hue }
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180
  const a = c * Math.cos(radians)
  const b = c * Math.sin(radians)

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return {
    r: fromLinear(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: fromLinear(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: fromLinear(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  }
}

/** Whether a colour can actually be shown, rather than being clipped into something else. */
export function inSrgbGamut(colour: Oklch, tolerance = 0.001): boolean {
  const { r, g, b } = oklchToRgb(colour)
  return [r, g, b].every((v) => v >= -tolerance && v <= 1 + tolerance)
}

/**
 * The most saturated version of a colour that sRGB can actually display.
 *
 * Out-of-gamut values are clipped per channel by the browser, and clipping
 * changes lightness -- which is the one property the ramp depends on holding
 * still. Reducing chroma until the colour fits keeps the step where it was
 * meant to be, just less vivid.
 */
export function fitChroma(l: number, c: number, h: number, steps = 24): number {
  if (inSrgbGamut({ l, c, h })) return c

  let low = 0
  let high = c
  for (let i = 0; i < steps; i++) {
    const mid = (low + high) / 2
    if (inSrgbGamut({ l, c: mid, h })) low = mid
    else high = mid
  }
  return low
}

const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
