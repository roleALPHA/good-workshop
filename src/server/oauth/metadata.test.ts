import { afterEach, describe, expect, it, vi } from 'vitest'
import { OAUTH_SCOPES } from '@/domain/oauth/rules'
import { protectedResourceMetadata, unauthorizedChallenge } from './metadata'

/**
 * The two places a client learns which scopes to ask for.
 *
 * A client reads them before it has ever seen the consent screen, and asks for
 * exactly what they name. When both said "read", Claude and ChatGPT asked for
 * reading, were granted reading, and every write tool they were shown failed.
 * The server would have granted writing all along -- nobody had told the
 * client it was on offer.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('what a client is told it may ask for', () => {
  it('lists the offered scopes in the protected resource metadata', () => {
    vi.stubEnv('GW_APP_URL', 'https://ws.example.com')
    expect(protectedResourceMetadata().scopes_supported).toEqual(OAUTH_SCOPES)
  })

  it('names the same scopes in the 401 that starts the flow', () => {
    vi.stubEnv('GW_APP_URL', 'https://ws.example.com')
    const challenge = unauthorizedChallenge()

    expect(challenge).toContain(`scope="${OAUTH_SCOPES.join(' ')}"`)
    expect(challenge).toContain('workshops:write')
    expect(challenge).toContain(
      'resource_metadata="https://ws.example.com/.well-known/oauth-protected-resource"',
    )
  })
})
