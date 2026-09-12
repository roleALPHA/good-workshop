import { createHash, timingSafeEqual } from 'node:crypto'
import { SCOPES, type Scope } from '@/domain/tenant/tokens'

/**
 * The parts of OAuth 2.1 that are decisions rather than plumbing.
 *
 * Everything here is pure and has a test table, because these are the lines
 * where a mistake is a hole rather than a bug: which redirect target is
 * acceptable, whether a code verifier matches, what audience a token is good
 * for, and which scopes a client may end up with.
 */

/** Access tokens live briefly; the refresh token is what carries the session. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
export const AUTHORIZATION_CODE_TTL_SECONDS = 60

/**
 * PKCE, S256 only.
 *
 * OAuth 2.1 still allows `plain` for clients that cannot compute a hash. A
 * service reachable over HTTPS from the public internet is not such a client,
 * and accepting `plain` would mean accepting a challenge that protects nothing.
 */
export function verifyCodeChallenge(verifier: string, challenge: string): boolean {
  // The verifier's own shape is part of the check: RFC 7636 fixes the length,
  // and a short one would make the hash cheap to search.
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false

  const computed = createHash('sha256').update(verifier).digest('base64url')
  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(challenge, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Whether a redirect target is one this client registered.
 *
 * Exact string comparison, deliberately: prefix matching is how an open
 * redirector is built by accident, and "the registered URI plus anything"
 * includes paths the client never asked for.
 */
export function redirectUriAllowed(candidate: string, registered: readonly string[]): boolean {
  return registered.includes(candidate)
}

/**
 * Whether a redirect target may be registered at all.
 *
 * Loopback and a private-use scheme are how a CLI or a native app receives a
 * code, so both are in. What is out is plain `http://` to anywhere else -- a
 * code travelling in the clear across a network is the thing PKCE cannot save.
 *
 * The third branch used to be a DENYLIST: any scheme at all, minus
 * `javascript:`. CodeQL found it (`js/incomplete-url-scheme-check`) before
 * anybody registered one, and it was right -- `data:`, `vbscript:`, `blob:` and
 * `file:` would all have passed, and each of them turns "we send the user
 * somewhere" into something else entirely.
 *
 * It is an allowlist now, and the rule is RFC 7595's: a private-use scheme is
 * reverse-DNS, `com.example.app`. The dot is what separates a scheme somebody
 * owns a domain for from one the browser already means something by -- there is
 * no `data.something:` and no `javascript.something:`.
 */
export function registrableRedirectUri(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.hash) return false
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:') return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  return /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:$/.test(url.protocol)
}

/**
 * The scopes a request may actually receive.
 *
 * The intersection of what was asked for with what this product has -- an
 * unknown scope is dropped rather than refused, which is what RFC 6749 §3.3
 * allows and what keeps a client that asks for one scope too many from failing
 * outright. `offline_access` is understood and NOT returned: it asks for a
 * refresh token, it is not a permission on anything.
 */
export function narrowScopes(requested: string | null | undefined): Scope[] {
  const asked = (requested ?? '').split(/\s+/).filter(Boolean)
  // No scope named at all means the minimum that is still useful: reading.
  if (asked.length === 0) return ['workshops:read', 'module_types:read']
  return SCOPES.filter((scope) => asked.includes(scope))
}

/** Whether the client asked to be able to come back without the user. */
export function wantsRefreshToken(requested: string | null | undefined): boolean {
  return (requested ?? '').split(/\s+/).includes('offline_access')
}

/**
 * Whether a token issued for `audience` may be used at `resource`.
 *
 * Compared as strings after one normalisation -- a trailing slash. The MCP
 * specification asks for the canonical form without one, and a client that
 * sends one anyway is not an attacker, it is a client.
 */
export function audienceMatches(audience: string, resource: string): boolean {
  const strip = (value: string) => value.replace(/\/+$/, '')
  return strip(audience) === strip(resource)
}

/**
 * The `resource` a client asked for, if we recognise it as ourselves.
 *
 * Anything else is refused rather than ignored: issuing a token for an
 * audience we do not serve is how a confused-deputy attack starts, and the
 * client would then hand our token to somebody else's server.
 */
export function canonicalResource(requested: string | null, canonical: string): string | null {
  if (requested === null) return canonical
  return audienceMatches(requested, canonical) ? canonical : null
}
