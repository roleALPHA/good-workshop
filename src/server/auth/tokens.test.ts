import { describe, expect, it } from 'vitest'
import {
  generateOAuthToken,
  generatePersonalAccessToken,
  hashSecret,
  parseOAuthToken,
  parsePersonalAccessToken,
} from './tokens'

/**
 * The two token shapes, and the line between them.
 *
 * Both are `prefix_<public id>_<secret>`, and the public half is what gets
 * indexed -- so verification is one indexed read and a constant-time compare,
 * never a scan over a table of hashes.
 */

describe('an OAuth token', () => {
  it('round-trips through its own parser', () => {
    const made = generateOAuthToken('access')
    const parsed = parseOAuthToken(made.token)

    expect(parsed).toMatchObject({ kind: 'access', tokenKey: made.tokenKey })
    expect(hashSecret(parsed!.secret)).toBe(made.secretHash)
  })

  it('tells an access token apart from a refresh token by its prefix', () => {
    // Two prefixes rather than one, so a refresh token presented as a bearer at
    // the MCP endpoint is refused by its shape before anything looks it up.
    expect(parseOAuthToken(generateOAuthToken('refresh').token)?.kind).toBe('refresh')
    expect(parseOAuthToken(generateOAuthToken('access').token)?.kind).toBe('access')
  })

  it('does not accept a personal access token, and the other way round', () => {
    expect(parseOAuthToken(generatePersonalAccessToken().token)).toBeNull()
    expect(parsePersonalAccessToken(generateOAuthToken('access').token)).toBeNull()
  })

  it.each([['gwo_short_x'], ['gwx_abcdefghijkl_' + 'a'.repeat(30)], ['nonsense'], ['']])(
    'refuses %s',
    (candidate) => {
      expect(parseOAuthToken(candidate)).toBeNull()
    },
  )
})
