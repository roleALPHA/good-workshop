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

/**
 * The files that are deliberately the same in every language.
 *
 * The product tour is narrated in English and shows an English interface, so
 * there is one of it rather than four; the name says so. Its poster is a frame
 * of that same video. Everything else under /marketing/ has to be per language,
 * which is what the test below still enforces.
 */
const LANGUAGE_FREE = ['/marketing/tour-en.mp4', '/marketing/tour-poster.jpg']

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
    const fixed = sources.filter((src) => src.startsWith('/marketing/'))
    expect(fixed.filter((src) => !LANGUAGE_FREE.includes(src))).toHaveLength(0)
  })

  it('serve the tour from here rather than from a video platform', () => {
    // The whole site loads no third party, and the FAQ says so in as many
    // words. An embed would put cookies and an IP address in somebody else's
    // hands on the landing page, so the file is ours and the test says it.
    // The tag and the address, not the word: the comment in home.tsx explains
    // why there is no iframe, and matching on prose failed on that explanation.
    expect(home).not.toMatch(/<iframe/i)
    expect(sources.filter((src) => /youtube|youtu\.be|vimeo/i.test(src))).toHaveLength(0)
    for (const file of LANGUAGE_FREE) {
      const onDisk = join(root, 'public', file.replace(/^\//, ''))
      expect(statSync(onDisk).size, `${file} is missing or empty`).toBeGreaterThan(1000)
    }
  })

  it('give the tour a description and a size, like every picture', () => {
    // <video> is not caught by the image checks below, and the two failures
    // are the same: a player nobody can identify, and a page that jumps when
    // the poster lands.
    const video = home.match(/<video[\s\S]*?>/)?.[0] ?? ''
    expect(video, 'no video on the page').not.toBe('')
    expect(video).toMatch(/aria-label=\{/)
    expect(video).toMatch(/width=\{\d+\}/)
    expect(video).toMatch(/height=\{\d+\}/)
    // Autoplay would talk over the visitor; preload would fetch four megabytes
    // at nobody's request.
    expect(video).not.toMatch(/autoPlay/)
    expect(video).toMatch(/preload="none"/)
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
