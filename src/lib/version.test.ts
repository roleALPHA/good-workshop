import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../../package.json'
import { appVersion, displayVersion } from './version'

const release = `v${pkg.version}`

/**
 * The footer used to print GW_VERSION, and GW_VERSION inside a container is not
 * what the image was built as: compose hands in the .env value, which is the
 * image TAG. A preview pulling `main` therefore said "main" at the bottom of
 * every page -- a word, not a version, and useless in a support conversation.
 */
describe('the version a person reads in the footer', () => {
  it('is the release number on a release image, whatever tag the .env pulled it by', () => {
    vi.stubEnv('GW_VERSION', 'main')
    vi.stubEnv('GW_BUILD', `${release}-414f9e2`)
    expect(displayVersion()).toBe(release)
  })

  it('names the build after the release number when the image is not a release', () => {
    vi.stubEnv('GW_VERSION', 'main')
    vi.stubEnv('GW_BUILD', 'main-414f9e2')
    expect(displayVersion()).toBe(`${release}+main-414f9e2`)
  })

  it('says dev for a checkout that was never packaged', () => {
    vi.stubEnv('GW_VERSION', undefined)
    vi.stubEnv('GW_BUILD', undefined)
    expect(displayVersion()).toBe(`${release}+dev`)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the running version', () => {
  it('is whatever the image was built with', () => {
    vi.stubEnv('GW_VERSION', 'v0.3.1')
    expect(appVersion()).toBe('v0.3.1')
  })

  it('says dev when nothing built it -- a checkout is not a release', () => {
    vi.stubEnv('GW_VERSION', undefined)
    expect(appVersion()).toBe('dev')
  })

  it('reads the environment per call, so a container restart is not needed to notice', () => {
    vi.stubEnv('GW_VERSION', 'v0.3.0')
    expect(appVersion()).toBe('v0.3.0')
    vi.stubEnv('GW_VERSION', 'v0.3.1')
    expect(appVersion()).toBe('v0.3.1')
  })
})
