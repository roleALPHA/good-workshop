import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The pictures the website shows.
 *
 * Two things go wrong with screenshots in a repository, and both are quiet: a
 * file is renamed and the page shows a broken image, or a picture arrives
 * without a description and a screen reader announces nothing at all. Neither
 * shows up in a build.
 */

const root = join(import.meta.dirname, '../../..')
const home = readFileSync(join(root, 'src/cloud/site/home.tsx'), 'utf8')
const LOCALES = ['de', 'en', 'es', 'fr']
const SHOTS = ['agenda.png', 'library.png', 'phone.png']

/** Every picture tag, whether plain or Next's. */
const images = () => home.match(/<(?:img|Image)[\s\S]*?\/>/g) ?? []

/** Every `src="/..."` in the site's own components. */
const sources = [...home.matchAll(/src="(\/[^"]+)"/g)].map((match) => match[1]!)

describe('the pictures on the website', () => {
  it('exist in every language the website speaks', () => {
    // A missing language would not break the build: the page would ask for a
    // file that is not there and show nothing at all.
    for (const locale of LOCALES) {
      for (const shot of SHOTS) {
        const file = join(root, 'public', 'marketing', locale, shot)
        expect(statSync(file).size, `${locale}/${shot} is empty`).toBeGreaterThan(1000)
      }
    }
  })

  it('are addressed by language, not by a fixed path', () => {
    // A hard-coded /marketing/agenda.png would show German screenshots to
    // everybody, which is the mistake this whole set exists to fix.
    expect(home).toMatch(/marketing\/\$\{locale\}\//)
    expect(sources.filter((src) => src.startsWith('/marketing/'))).toHaveLength(0)
  })

  it('each carry a description', () => {
    // Not a hard-coded sentence: the alt text comes from the catalogs, and what
    // matters here is that no picture is rendered without one.
    for (const img of images()) {
      expect(img, `an image without alt: ${img.slice(0, 60)}`).toMatch(/alt=\{/)
    }
  })

  it('state their size, so the page does not jump while they load', () => {
    for (const img of images()) {
      expect(img).toMatch(/width=\{\d+\}/)
      expect(img).toMatch(/height=\{\d+\}/)
    }
  })
})
