import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * Encryption for the few configuration values that are secrets: the SMTP URL,
 * the Graph client secret.
 *
 * WHY THIS EXISTS AT ALL. Everything else an operator configures is harmless in
 * a backup -- a session lifetime, a sender address. These two are credentials,
 * and settings live in the database, so without this they would sit in every
 * `pg_dump`: in the file somebody mails to support, in the copy on a laptop, in
 * the snapshot that outlives the machine. That is the same argument compose.yaml
 * makes for SMTP_URL_FILE over SMTP_URL, applied one layer further in.
 *
 * A dump alone is therefore not enough to send mail as the organisation. The key
 * lives outside the database -- which is the point, and also the thing to
 * understand before relying on it: LOSE THE KEY AND THESE VALUES ARE GONE.
 * Nothing else breaks; the operator re-enters the credentials. `docs/` says so
 * next to the backup instructions.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails loudly instead of
 * decrypting to something else. Format is `gw1.<iv>.<tag>.<ciphertext>`, all
 * base64url. The version prefix is there so a future change of algorithm can
 * read what this one wrote rather than guessing.
 */

const PREFIX = 'gw1'
const KEY_BYTES = 32
const IV_BYTES = 12

export class SecretKeyError extends Error {}

let cached: Buffer | undefined

/**
 * The key, from GW_SECRET_KEY or the file GW_SECRET_KEY_FILE points at.
 *
 * Read once and kept: this runs on every settings read, and a file read per
 * decryption would be a syscall on a hot path for a value that cannot change
 * without a restart anyway.
 */
export function secretKey(): Buffer {
  if (cached) return cached

  const file = process.env.GW_SECRET_KEY_FILE
  const raw = file ? readFileSync(file, 'utf8').trim() : process.env.GW_SECRET_KEY?.trim()

  if (!raw) {
    throw new SecretKeyError(
      'GW_SECRET_KEY (or GW_SECRET_KEY_FILE) is not set. Without the key the encrypted ' +
        'settings can be neither read nor written.',
    )
  }

  // base64url is what scripts/secrets.mjs writes; hex is accepted because an
  // operator generating one by hand will reach for `openssl rand -hex 32`.
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64url')

  if (key.length !== KEY_BYTES) {
    throw new SecretKeyError(
      `GW_SECRET_KEY muss ${KEY_BYTES} Byte lang sein (base64url oder hex), ist aber ${key.length}.`,
    )
  }

  cached = key
  return key
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return [
    PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join('.')
}

export function decryptSecret(envelope: string): string {
  const [prefix, iv, tag, body] = envelope.split('.')

  if (prefix !== PREFIX || !iv || !tag || !body) {
    throw new SecretKeyError(`Unreadable format for an encrypted value: ${prefix ?? '?'}`)
  }

  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // GCM refuses rather than returning nonsense. The realistic cause is a
    // restored dump meeting a different key, and saying so saves an hour.
    throw new SecretKeyError(
      'An encrypted value cannot be decrypted with this GW_SECRET_KEY. If the database ' +
        'came from a backup, the key from back then belongs with it.',
    )
  }
}

/** Test seam. The key is cached for the process lifetime by design. */
export function resetSecretKeyCache(): void {
  cached = undefined
}
