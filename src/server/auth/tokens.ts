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
