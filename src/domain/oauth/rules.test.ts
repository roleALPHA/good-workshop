import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  audienceMatches,
  canonicalResource,
  narrowScopes,
  redirectUriAllowed,
  registrableRedirectUri,
  verifyCodeChallenge,
  wantsRefreshToken,
} from './rules'

/**
 * The lines where a mistake is a hole rather than a bug.
 *
 * Each of these has a shape that looks harmless when written and is a
 * vulnerability when read carefully: a prefix match on a redirect target, a
 * code verifier accepted without checking its length, an audience compared
 * loosely enough that a token works somewhere it was never meant to.
 */

const challengeFor = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

const VERIFIER = 'a'.repeat(43)

describe('PKCE', () => {
  it('accepts the verifier its challenge was made from', () => {
    expect(verifyCodeChallenge(VERIFIER, challengeFor(VERIFIER))).toBe(true)
  })

  it('refuses a different verifier', () => {
    expect(verifyCodeChallenge('b'.repeat(43), challengeFor(VERIFIER))).toBe(false)
  })

  it.each([
    ['too short to be worth hashing', 'a'.repeat(42)],
    ['too long', 'a'.repeat(129)],
    ['characters RFC 7636 does not allow', 'a'.repeat(42) + '/'],
    ['empty', ''],
  ])('refuses a verifier that is %s', (_why, verifier) => {
    // Checked BEFORE the hash: a two-character verifier whose hash happened to
    // match would otherwise be accepted, and searching that space is cheap.
    expect(verifyCodeChallenge(verifier, challengeFor(verifier))).toBe(false)
  })
})

describe('redirect targets', () => {
  const registered = ['https://client.example/cb', 'http://127.0.0.1:7777/cb']

  it('accepts one that was registered, exactly', () => {
    expect(redirectUriAllowed('https://client.example/cb', registered)).toBe(true)
  })

  it.each([
    ['a longer path under it', 'https://client.example/cb/evil'],
    ['a query appended', 'https://client.example/cb?next=evil'],
    ['another host entirely', 'https://evil.example/cb'],
    ['a different port on loopback', 'http://127.0.0.1:7778/cb'],
  ])('refuses %s', (_why, candidate) => {
    // Prefix matching is how an open redirector is built by accident.
    expect(redirectUriAllowed(candidate, registered)).toBe(false)
  })

  it.each([
    ['https anywhere', 'https://client.example/cb', true],
    ['http on loopback, which is how a CLI listens', 'http://localhost:1234/cb', true],
    ['http on 127.0.0.1', 'http://127.0.0.1:1234/cb', true],
    ['a private-use scheme, as a native app registers', 'com.example.app:/callback', true],
    [
      'http to anywhere else -- the code would travel in the clear',
      'http://evil.example/cb',
      false,
    ],
    ['javascript:, which is not a redirect but an injection', 'javascript:alert(1)', false],
    // A denylist that named `javascript:` and stopped there. CodeQL found it
    // (js/incomplete-url-scheme-check) before anybody registered one.
    [
      'data:, which is the same injection wearing a different hat',
      'data:text/html,<script>1</script>',
      false,
    ],
    ['vbscript:', 'vbscript:msgbox(1)', false],
    ['blob:', 'blob:https://evil.example/x', false],
    ['file:, which would point a code at the local disk', 'file:///etc/passwd', false],
    // A private-use scheme is reverse-DNS by RFC 7595, and that dot is what
    // tells one apart from a scheme the browser already means something by.
    ['a single-word scheme nobody registered', 'myapp:/callback', false],
    ['a fragment, which RFC 6749 forbids on a redirect URI', 'https://client.example/cb#x', false],
    ['nonsense', 'not a url', false],
  ])('registration: %s', (_why, uri, expected) => {
    expect(registrableRedirectUri(uri)).toBe(expected)
  })
})

describe('scopes', () => {
  it('drops what this product does not have rather than refusing the request', () => {
    expect(narrowScopes('workshops:read members:write nonsense')).toEqual(['workshops:read'])
  })

  it('never returns a member-management scope, because there is none', () => {
    // The decision from the PAT screen holds here too: an MCP client must not
    // be able to invite anybody or promote an admin.
    expect(narrowScopes('members:write admin tenant:write')).toEqual([])
  })

  it('falls back to reading when the client names no scope at all', () => {
    expect(narrowScopes(null)).toEqual(['workshops:read', 'module_types:read'])
    expect(narrowScopes('   ')).toEqual(['workshops:read', 'module_types:read'])
  })

  it('treats offline_access as a request for a refresh token, not as a permission', () => {
    expect(narrowScopes('workshops:read offline_access')).toEqual(['workshops:read'])
    expect(wantsRefreshToken('workshops:read offline_access')).toBe(true)
    expect(wantsRefreshToken('workshops:read')).toBe(false)
  })
})

describe('the audience a token is good for', () => {
  it('ignores a trailing slash, which is a client, not an attacker', () => {
    expect(audienceMatches('https://gw.example/api/mcp', 'https://gw.example/api/mcp/')).toBe(true)
  })

  it.each([
    ['another host', 'https://evil.example/api/mcp'],
    ['another path on the same host', 'https://gw.example/api/other'],
    ['http where we serve https', 'http://gw.example/api/mcp'],
  ])('refuses %s', (_why, other) => {
    expect(audienceMatches('https://gw.example/api/mcp', other)).toBe(false)
  })

  it('refuses to mint a token for an audience we do not serve', () => {
    // The client would then carry our token to somebody else's server, which
    // is where a confused deputy starts.
    expect(canonicalResource('https://evil.example/mcp', 'https://gw.example/api/mcp')).toBeNull()
  })

  it('defaults to ourselves when the client names nothing', () => {
    expect(canonicalResource(null, 'https://gw.example/api/mcp')).toBe('https://gw.example/api/mcp')
  })
})
