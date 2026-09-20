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

/** Every picture tag, whether plain or Next's. */
const images = () => home.match(/<(?:img|Image)[\s\S]*?\/>/g) ?? []

/** Every `src="/..."` in the site's own components. */
const sources = [...home.matchAll(/src="(\/[^"]+)"/g)].map((match) => match[1]!)

describe('the pictures on the website', () => {
  it('are actually in the repository', () => {
    expect(sources.length).toBeGreaterThan(0)
    for (const src of sources) {
      const file = join(root, 'public', src)
      expect(statSync(file).size, `${src} is empty`).toBeGreaterThan(1000)
    }
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
