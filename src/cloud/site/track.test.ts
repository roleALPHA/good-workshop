import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from './track'

/**
 * A conversion is reported on the way to something the visitor actually wants
 * -- the confirmation, the workspace. The counter may be missing, slow or
 * broken; none of that may stand between them.
 */

describe('conversion events', () => {
  afterEach(() => {
    delete window.umami
  })

  it('does nothing while no counter is loaded', async () => {
    await expect(track('signup-submitted')).resolves.toBeUndefined()
  })

  it('hands the event to the counter', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    window.umami = { track: send }
    await track('signup-confirmed')
    expect(send).toHaveBeenCalledWith('signup-confirmed', undefined)
  })

  it('stops waiting for a counter that does not answer', async () => {
    window.umami = { track: () => new Promise(() => {}) }
    const started = Date.now()
    await track('signup-confirmed', undefined, 20)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('swallows a counter that fails', async () => {
    window.umami = { track: () => Promise.reject(new Error('blocked')) }
    await expect(track('signup-submitted')).resolves.toBeUndefined()
  })
})
