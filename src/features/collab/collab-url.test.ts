// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { collabUrl } from './use-collab-document'

/**
 * Where the browser opens its socket.
 *
 * The page hands over `process.env.GW_COLLAB_URL`, and compose.yaml passes that
 * as `${GW_COLLAB_URL:-}` -- an empty string when the .env says nothing. An
 * empty string resolved against the page is the page itself, so the editor
 * would knock on /w/.../d/... instead of /collab and stay "offline" for good.
 */

const base = { workshopId: 'w1', dayId: 'd1', user: { name: 'Ada', hue: 200 } }

describe('collabUrl in the browser', () => {
  it('treats an empty url as unset and uses /collab on the same host', () => {
    const url = new URL(collabUrl({ ...base, url: '' }))
    expect(url.pathname).toBe('/collab')
    expect(url.searchParams.get('workshop')).toBe('w1')
  })

  it('uses a separate collaboration address when one is given', () => {
    const url = new URL(collabUrl({ ...base, url: 'https://collab.example.com/collab' }))
    expect(url.protocol).toBe('wss:')
    expect(url.host).toBe('collab.example.com')
  })
})
