import { afterEach, describe, expect, it, vi } from 'vitest'
import { appVersion } from './version'

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
