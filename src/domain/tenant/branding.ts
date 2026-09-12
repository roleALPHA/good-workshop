import {
  contrastRatio,
  fitChroma,
  oklchToRgb,
  parseHex,
  rgbToOklch,
  toHex,
  type Rgb,
} from '@/lib/color/oklch'
import { DomainError, type DomainErrorKey, type DomainErrorParams } from '@/domain/errors'

/**
 * A tenant's accent colour, turned into a ramp the server vouches for.
 *
 * The tenant gives one hex. Hue and chroma are taken from it; every lightness
 * step is fixed here. That asymmetry is the whole design: OKLCH lightness is
 * perceptual, so holding it still means a brand colour can be swapped without
 * re-checking the contrast of every surface it lands on.
 *
 * Branding touches --brand-* and never .cat-*. Category colours are semantics
 * ("this is a break"), not decoration, and their mutual distinguishability is
 * what keeps the legend readable. A tenant painting their corporate blue over
 * every module type would make the agenda unreadable -- module-type colours
 * are changed one at a time, under Modultypen, where they belong.
 */

/**
 * The ramp, transcribed from globals.css step for step.
 *
 * Chroma is either a multiple of the tenant's (`factor`) or a literal the
 * stylesheet hard-codes. That distinction is not a detail: checking contrast
 * against colours the browser will not actually paint is worse than not
 * checking at all, because it promises something.
 */
type Step = { l: number; factor?: number; c?: number }

type RampSteps = {
  brand: Step
  hover: Step
  active: Step
  fg: Step
  subtleBg: Step
  subtleFg: Step
  ring: Step
}

const RAMP: Record<'light' | 'dark', RampSteps> = {
  light: {
    brand: { l: 0.545, factor: 1 },
    hover: { l: 0.485, factor: 1 },
    active: { l: 0.43, factor: 1 },
    fg: { l: 0.995, c: 0.005 },
    subtleBg: { l: 0.965, c: 0.028 },
    subtleFg: { l: 0.4, c: 0.11 },
    ring: { l: 0.64, c: 0.14 },
  },
  dark: {
    brand: { l: 0.66, factor: 0.88 },
    hover: { l: 0.715, factor: 0.85 },
    active: { l: 0.76, factor: 0.79 },
    fg: { l: 0.185, c: 0.02 },
    subtleBg: { l: 0.285, c: 0.055 },
    subtleFg: { l: 0.885, c: 0.055 },
    ring: { l: 0.68, c: 0.13 },
  },
}

/** Chroma ceiling. Beyond this an accent stops reading as a brand and starts glowing. */
const MAX_CHROMA = 0.22

/**
 * The default accent, as a colour somebody can type.
 *
 * Named here so the form's placeholder and the suggestion in a refusal are the
 * same value. Two copies of it would drift, and the one in the error message
 * would be the one nobody notices.
 */
export const SUGGESTED_BRAND_HEX = '#7c3aed'

export type Brand = { hue: number; chroma: number }

export class BrandError extends DomainError {
  /** A colour close to what they asked for that would have been accepted. */
  constructor(
    key: DomainErrorKey,
    readonly suggestion: string | null = null,
    params: DomainErrorParams = {},
  ) {
    super(key, params)
  }
}

/**
 * Reads a brand colour, or explains why it cannot be one.
 *
 * The two refusals are the ones a person can act on: a colour with no hue at
 * all, and one whose ramp would fail contrast. Everything else -- too vivid
 * for sRGB at some step, slightly out of gamut -- is fixed silently, because
 * "your green is 0.03 too saturated at the 96.5% lightness step" is not
 * feedback anybody can use.
 */
export function readBrand(hex: string): Brand {
  const rgb = parseHex(hex)
  if (!rgb) throw new BrandError('brand.notHex')

  const { c, h } = rgbToOklch(rgb)
  if (c < 0.02) {
    throw new BrandError('brand.grey', SUGGESTED_BRAND_HEX)
  }

  const chroma = Math.min(c, MAX_CHROMA)
  const brand = { hue: h, chroma }

  const failure = firstContrastFailure(brand)
  if (failure) {
    // Should not happen with the ramp above -- fixed perceptual lightness is
    // what buys the guarantee. It fires if somebody edits those constants, and
    // then it fires here rather than in somebody's unreadable interface.
    // Two keys rather than one with the surface as a parameter: naming the
    // surface is a full clause, and a clause is a thing to translate, not a
    // noun to slot in.
    throw new BrandError(
      failure.what === 'onBrand' ? 'brand.contrastOnBrand' : 'brand.contrastSubtle',
      failure.suggestion,
      { theme: failure.theme, ratio: failure.ratio.toFixed(1) },
    )
  }

  return brand
}

/**
 * The custom properties for one tenant.
 *
 * Only the two axes are emitted. Every lightness step already lives in the
 * stylesheet, so a tenant cannot reach a step and there is no second copy of
 * the ramp to drift.
 */
export function brandCss(brand: Brand | null): string | null {
  if (!brand) return null
  return `:root{--brand-h:${brand.hue.toFixed(2)};--brand-c:${brand.chroma.toFixed(4)}}`
}

type Failure = {
  theme: 'light' | 'dark'
  what: 'onBrand' | 'subtle'
  ratio: number
  suggestion: string | null
}

function firstContrastFailure(brand: Brand): Failure | null {
  for (const theme of ['light', 'dark'] as const) {
    const steps = RAMP[theme]
    const pairs: [Failure['what'], Step, Step][] = [
      ['onBrand', steps.fg, steps.brand],
      ['subtle', steps.subtleFg, steps.subtleBg],
    ]

    for (const [what, foreground, background] of pairs) {
      const ratio = contrastRatio(paint(brand, foreground), paint(brand, background))
      if (ratio < 4.5) return { theme, what, ratio, suggestion: null }
    }
  }
  return null
}

/**
 * One step as a real, displayable colour.
 *
 * The gamut fit is what the browser would otherwise do by clipping channels --
 * except clipping moves the lightness, and fixed lightness is the property the
 * whole guarantee rests on.
 */
function paint(brand: Brand, step: Step): Rgb {
  const chroma = step.c ?? brand.chroma * (step.factor ?? 1)
  return oklchToRgb({ l: step.l, c: fitChroma(step.l, chroma, brand.hue), h: brand.hue })
}

/** The accent itself, for a swatch. */
export function brandSwatch(brand: Brand): string {
  return toHex(paint(brand, RAMP.light.brand))
}
