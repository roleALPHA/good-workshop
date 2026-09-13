import { afterEach, describe, expect, it } from 'vitest'
import { collabUrl } from './client'

/**
 * Where an MCP write connects to join a room.
 *
 * compose.yaml passes `GW_COLLAB_INTERNAL_URL: ${GW_COLLAB_INTERNAL_URL:-}`, so
 * a value left out of the .env arrives as an empty string. That has to mean
 * "use the default", not "connect to ''".
 */

const saved = process.env.GW_COLLAB_INTERNAL_URL

afterEach(() => {
  if (saved === undefined) delete process.env.GW_COLLAB_INTERNAL_URL
  else process.env.GW_COLLAB_INTERNAL_URL = saved
})

const target = { workshopId: 'w1', dayId: 'd1' }

describe('collabUrl on the server', () => {
  it('falls back to the in-container address when GW_COLLAB_INTERNAL_URL is empty', () => {
    process.env.GW_COLLAB_INTERNAL_URL = ''
    expect(collabUrl(target)).toBe('ws://127.0.0.1:3001/collab?workshop=w1&day=d1')
  })

  it('uses GW_COLLAB_INTERNAL_URL when it is set', () => {
    process.env.GW_COLLAB_INTERNAL_URL = 'ws://collab.internal:4000/collab'
    expect(collabUrl(target)).toBe('ws://collab.internal:4000/collab?workshop=w1&day=d1')
  })
})
