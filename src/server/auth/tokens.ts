import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Secrets are stored hashed, never in the clear.
 *
 * A stolen database dump must not contain working session cookies, magic links
 * or API tokens. SHA-256 is right here and bcrypt/argon2 would be wrong: these
 * are 256 bits of machine-generated randomness, not human-chosen secrets, so
 * there is no dictionary to slow down -- only a lookup to make constant-time.
 */

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** Constant-time compare over the hex digests, so a mismatch leaks no position. */
export function verifySecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/**
 * A personal access token: `gwp_<public id>_<secret>`.
 *
 * The public id is what gets indexed and looked up, so verification is one
 * indexed read plus one constant-time compare -- never a scan over a table of
 * hashes, which is how token verification quietly becomes O(n).
 */
export function generatePersonalAccessToken(): {
  token: string
  tokenId: string
  tokenHash: string
} {
  const tokenId = randomBytes(9).toString('base64url').slice(0, 12)
  const secret = generateSecret(32)
  return { token: `gwp_${tokenId}_${secret}`, tokenId, tokenHash: hashSecret(secret) }
}

export function parsePersonalAccessToken(
  token: string,
): { tokenId: string; secret: string } | null {
  const match = /^gwp_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{20,})$/.exec(token.trim())
  return match ? { tokenId: match[1]!, secret: match[2]! } : null
}

/**
 * An OAuth access or refresh token: `gwo_<key>_<secret>` / `gwr_<key>_<secret>`.
 *
 * The same shape as a personal access token, for the same reason: the public
 * half is indexed, so verification is one indexed read plus a constant-time
 * compare rather than a scan over a table of hashes.
 *
 * Two prefixes rather than one, so a refresh token presented as a bearer at the
 * MCP endpoint is refused by its shape before anything looks it up. They are
 * different credentials with different lifetimes, and the type system cannot
 * tell them apart once both are strings.
 */
export function generateOAuthToken(kind: 'access' | 'refresh'): {
  token: string
  tokenKey: string
  secretHash: string
} {
  const tokenKey = randomBytes(9).toString('base64url').slice(0, 12)
  const secret = generateSecret(32)
  const prefix = kind === 'access' ? 'gwo' : 'gwr'
  return { token: `${prefix}_${tokenKey}_${secret}`, tokenKey, secretHash: hashSecret(secret) }
}

export function parseOAuthToken(
  token: string,
): { kind: 'access' | 'refresh'; tokenKey: string; secret: string } | null {
  const match = /^gw([or])_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{20,})$/.exec(token.trim())
  if (!match) return null
  return {
    kind: match[1] === 'o' ? 'access' : 'refresh',
    tokenKey: match[2]!,
    secret: match[3]!,
  }
}

/**
 * An operator's bearer token: `gwop_<key>_<secret>`.
 *
 * A fourth prefix, and the reason is the one the two above already state. The
 * operator console reaches every tenant; a customer's personal access token
 * presented at its MCP endpoint -- or an operator token presented at the
 * customer one -- is refused BY ITS SHAPE, before anything is looked up. Two
 * credentials that are both strings are otherwise told apart only by whichever
 * lookup happens to fail first.
 *
 * `gwop_` and not `gwo_`: that one is already an OAuth access token, and a
 * prefix that is a prefix of another prefix is a parser waiting to be wrong.
 */
export function generateOperatorToken(): { token: string; tokenKey: string; tokenHash: string } {
  const tokenKey = randomBytes(9).toString('base64url').slice(0, 12)
  const secret = generateSecret(32)
  return { token: `gwop_${tokenKey}_${secret}`, tokenKey, tokenHash: hashSecret(secret) }
}

export function parseOperatorToken(token: string): { tokenKey: string; secret: string } | null {
  const match = /^gwop_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{20,})$/.exec(token.trim())
  return match ? { tokenKey: match[1]!, secret: match[2]! } : null
}

/**
 * The operator console's OAuth tokens: `gwopa_<key>_<secret>` for an access
 * token, `gwopr_<key>_<secret>` for a refresh token.
 *
 * A fifth and sixth prefix, for the reason the four above give and one more.
 * The console runs its own authorization server, so there are now two of every
 * kind of OAuth credential in the system, and the pair that must never be
 * confused is the access tokens: one reaches a single workspace as a member,
 * the other reaches EVERY workspace as the platform. Distinct prefixes mean a
 * customer's `gwo_` presented at /operator/api/mcp is refused before any
 * lookup, and an operator's `gwopa_` presented at /api/mcp likewise.
 *
 * Neither is a prefix of `gwop_` or of `gwo_`: every parser here anchors on a
 * literal `_` after a fixed prefix, so `gwopa_` cannot be read as `gwop_` with
 * a key beginning in `a`.
 */
export function generateOperatorOAuthToken(kind: 'access' | 'refresh'): {
  token: string
  tokenKey: string
  secretHash: string
} {
  const tokenKey = randomBytes(9).toString('base64url').slice(0, 12)
  const secret = generateSecret(32)
  const prefix = kind === 'access' ? 'gwopa' : 'gwopr'
  return { token: `${prefix}_${tokenKey}_${secret}`, tokenKey, secretHash: hashSecret(secret) }
}

export function parseOperatorOAuthToken(
  token: string,
): { kind: 'access' | 'refresh'; tokenKey: string; secret: string } | null {
  const match = /^gwop([ar])_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{20,})$/.exec(token.trim())
  if (!match) return null
  return {
    kind: match[1] === 'a' ? 'access' : 'refresh',
    tokenKey: match[2]!,
    secret: match[3]!,
  }
}
