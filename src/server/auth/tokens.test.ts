import { describe, expect, it } from 'vitest'
import {
  generateOAuthToken,
  generateOperatorOAuthToken,
  generateOperatorToken,
  generatePersonalAccessToken,
  hashSecret,
  parseOAuthToken,
  parseOperatorOAuthToken,
  parseOperatorToken,
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

/**
 * Six credential shapes, and the claim that no parser accepts another's.
 *
 * Written as the full cross-product rather than as a handful of pairs,
 * because the failure this guards is not "a parser is too strict" -- that
 * shows up immediately -- but "a parser is too loose", which shows up as one
 * credential being silently honoured where another was meant. The pair that
 * matters most is `gwo_` and `gwopa_`: one reaches a single workspace as a
 * member, the other reaches EVERY workspace as the platform.
 *
 * `gwop_`, `gwopa_` and `gwopr_` also make the prefix-of-a-prefix case real:
 * every parser anchors on a literal `_` after a fixed prefix, and this is what
 * says so out loud.
 */
describe('no credential is another kind', () => {
  const shapes = {
    personal: () => generatePersonalAccessToken().token,
    oauthAccess: () => generateOAuthToken('access').token,
    oauthRefresh: () => generateOAuthToken('refresh').token,
    operator: () => generateOperatorToken().token,
    operatorAccess: () => generateOperatorOAuthToken('access').token,
    operatorRefresh: () => generateOperatorOAuthToken('refresh').token,
  }

  const parsers = {
    personal: parsePersonalAccessToken,
    oauth: parseOAuthToken,
    operator: parseOperatorToken,
    operatorOAuth: parseOperatorOAuthToken,
  }

  /** Which parser each shape is allowed to satisfy, and only that one. */
  const owner: Record<keyof typeof shapes, keyof typeof parsers> = {
    personal: 'personal',
    oauthAccess: 'oauth',
    oauthRefresh: 'oauth',
    operator: 'operator',
    operatorAccess: 'operatorOAuth',
    operatorRefresh: 'operatorOAuth',
  }

  for (const [shape, make] of Object.entries(shapes) as [keyof typeof shapes, () => string][]) {
    for (const [name, parse] of Object.entries(parsers) as [
      keyof typeof parsers,
      (raw: string) => unknown,
    ][]) {
      const allowed = owner[shape] === name
      it(`${allowed ? 'accepts' : 'refuses'} a ${shape} token in the ${name} parser`, () => {
        expect(parse(make()) === null).toBe(!allowed)
      })
    }
  }

  it('round-trips an operator OAuth token and keeps its kind', () => {
    const made = generateOperatorOAuthToken('refresh')
    const parsed = parseOperatorOAuthToken(made.token)

    expect(parsed).toMatchObject({ kind: 'refresh', tokenKey: made.tokenKey })
    expect(hashSecret(parsed!.secret)).toBe(made.secretHash)
    expect(parseOperatorOAuthToken(generateOperatorOAuthToken('access').token)?.kind).toBe('access')
  })
})
