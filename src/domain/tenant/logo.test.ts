import { describe, expect, it } from 'vitest'
import { LogoError, MAX_LOGO_BYTES, readLogo } from './logo'

const svg = (inner: string) =>
  new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`,
  )

const png = () => {
  const bytes = new Uint8Array(64)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return bytes
}

const webp = () => {
  const bytes = new Uint8Array(64)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WEBP'), 8)
  return bytes
}

describe('readLogo', () => {
  it('accepts a plain SVG', () => {
    const logo = readLogo(svg('<circle cx="5" cy="5" r="4" fill="#7c3aed"/>'), 'image/svg+xml')
    expect(logo.mime).toBe('image/svg+xml')
    expect(logo.data.length).toBeGreaterThan(0)
  })

  it('accepts a local reference, which is ordinary in exported artwork', () => {
    expect(() =>
      readLogo(
        svg(
          '<defs><linearGradient id="g"/></defs><rect fill="url(#g)" href="#g" width="10" height="10"/>',
        ),
        'image/svg+xml',
      ),
    ).not.toThrow()
  })

  /**
   * Asserted as key plus the construct that tripped it, rather than as words.
   * That pins WHICH rule fired -- a test matching /externe Verweise/ passed
   * just as happily when a different rule caught the same file first.
   */
  it.each([
    ['<script>alert(1)</script>', 'logo.unsafeActive', '<script>'],
    ['<foreignObject><b>x</b></foreignObject>', 'logo.unsafeActive', '<foreignObject>'],
    ['<style>@import url(https://evil.test/x.css)</style>', 'logo.unsafeActive', '<style>'],
    ['<rect onload="alert(1)" width="10" height="10"/>', 'logo.unsafeActive', 'on…='],
    [
      '<a href="javascript:alert(1)"><rect width="10" height="10"/></a>',
      'logo.unsafeActive',
      'javascript:',
    ],
    ['<image href="https://evil.test/pixel.png"/>', 'logo.unsafeExternal', 'href'],
    ['<use xlink:href="https://evil.test/x.svg#a"/>', 'logo.unsafeExternal', 'href'],
    ['<iframe src="https://evil.test"></iframe>', 'logo.unsafeActive', '<iframe>/<embed>/<object>'],
  ])('refuses %s', (inner, key, what) => {
    // Refused, not cleaned: a near-miss in a cleaning pass leaves a file that
    // passed the check and still runs.
    expect(() => readLogo(svg(inner), 'image/svg+xml')).toThrow(LogoError)
    try {
      readLogo(svg(inner), 'image/svg+xml')
      expect.unreachable('the upload should have been refused')
    } catch (error) {
      expect(error).toBeInstanceOf(LogoError)
      expect((error as LogoError).messageKey).toBe(key)
      expect((error as LogoError).params.what).toBe(what)
    }
  })

  it('refuses a file that is not an SVG at all', () => {
    expect(() => readLogo(new TextEncoder().encode('nur text'), 'image/svg+xml')).toThrow(LogoError)
  })

  it('accepts PNG and WebP by their own first bytes', () => {
    expect(readLogo(png(), 'image/png').mime).toBe('image/png')
    expect(readLogo(webp(), 'image/webp').mime).toBe('image/webp')
  })

  it('refuses a file whose content contradicts its declared type', () => {
    // The declared type is the client's claim; the first bytes are the file's
    // own answer, and it is the file that gets served back with that header.
    expect(() => readLogo(png(), 'image/webp')).toThrow('logo.typeMismatch')
  })

  it('refuses a type that is not on the list', () => {
    expect(() => readLogo(png(), 'image/gif')).toThrow('logo.unsupportedType')
  })

  it('refuses an empty file', () => {
    expect(() => readLogo(new Uint8Array(0), 'image/png')).toThrow('logo.empty')
  })

  it('refuses one that is too big, and says by how much', () => {
    const huge = new Uint8Array(MAX_LOGO_BYTES + 1024)
    huge.set([0x89, 0x50, 0x4e, 0x47])
    expect(() => readLogo(huge, 'image/png')).toThrow('logo.tooLarge')
    try {
      readLogo(huge, 'image/png')
      expect.unreachable('the upload should have been refused')
    } catch (error) {
      // "says by how much" is the point of this test, and the numbers survive
      // the move to keys as arguments.
      expect((error as LogoError).params).toMatchObject({ max: 256 })
      expect(Number((error as LogoError).params.actual)).toBeGreaterThan(256)
    }
  })
})

/**
 * The SVG rejections that the current patterns let through.
 *
 * The delivery path is the real defence and it is correct: the logo route
 * serves `default-src 'none'; ... sandbox` plus nosniff, and a sandboxed
 * document runs no script even when opened directly. So none of these is
 * exploitable today.
 *
 * They are still bugs, because the rejection filter is sold as the second
 * layer. A second layer with holes in it is worse than an acknowledged single
 * layer: it is the reason nobody looks again.
 */
describe('readLogo: rejection gaps', () => {
  const svg = (body: string) =>
    new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`)

  it.each([
    {
      name: 'external reference without quotes',
      // The href pattern requires a quote character before the scheme.
      body: '<image href=http://evil.example/x.png />',
    },
    {
      name: 'data: reference in <use>, unquoted',
      body: '<use href=data:image/svg+xml;base64,PHN2Zz48L3N2Zz4= />',
    },
    {
      name: 'event handler assembled from an entity',
      body: '<!DOCTYPE svg [<!ENTITY e "onload=alert(1)">]><rect &e; />',
    },
    {
      name: 'an entity expansion bomb',
      body: '<!DOCTYPE svg [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><text>&b;</text>',
    },
  ])('rejects $name', ({ body }) => {
    expect(() => readLogo(svg(body), 'image/svg+xml')).toThrow(LogoError)
  })

  it('checks the bytes rather than trusting the declared type', () => {
    // Raster formats are verified by signature; SVG is matched with a regex
    // against content the client also labelled. The label is the client's
    // claim, and the file is served back under it.
    const notSvg = new TextEncoder().encode('GIF89a<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(() => readLogo(notSvg, 'image/svg+xml')).toThrow(LogoError)
  })
})
