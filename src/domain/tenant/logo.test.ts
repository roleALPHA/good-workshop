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

  it.each([
    ['<script>alert(1)</script>', /<script>/],
    ['<foreignObject><b>x</b></foreignObject>', /foreignObject/],
    ['<style>@import url(https://evil.test/x.css)</style>', /<style>/],
    ['<rect onload="alert(1)" width="10" height="10"/>', /Event-Handler/],
    ['<a href="javascript:alert(1)"><rect width="10" height="10"/></a>', /javascript/],
    ['<image href="https://evil.test/pixel.png"/>', /externe Verweise/],
    ['<use xlink:href="https://evil.test/x.svg#a"/>', /externe Verweise/],
    ['<iframe src="https://evil.test"></iframe>', /Fremdinhalte/],
  ])('refuses %s', (inner, message) => {
    // Refused, not cleaned: a near-miss in a cleaning pass leaves a file that
    // passed the check and still runs.
    expect(() => readLogo(svg(inner), 'image/svg+xml')).toThrow(message)
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
    expect(() => readLogo(png(), 'image/webp')).toThrow(/passt nicht/)
  })

  it('refuses a type that is not on the list', () => {
    expect(() => readLogo(png(), 'image/gif')).toThrow(/SVG, PNG und WebP/)
  })

  it('refuses an empty file', () => {
    expect(() => readLogo(new Uint8Array(0), 'image/png')).toThrow(/leer/)
  })

  it('refuses one that is too big, and says by how much', () => {
    const huge = new Uint8Array(MAX_LOGO_BYTES + 1024)
    huge.set([0x89, 0x50, 0x4e, 0x47])
    expect(() => readLogo(huge, 'image/png')).toThrow(/256 KB/)
  })
})
