import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, resetSecretKeyCache, SecretKeyError } from './secretbox'

/**
 * The envelope around configured credentials.
 *
 * The properties asserted here are the ones somebody relies on without checking:
 * that a dump alone is not enough, that a wrong key fails loudly rather than
 * quietly, and that a tampered value is refused instead of decrypting to
 * something else.
 */

const KEY_A = Buffer.alloc(32, 1).toString('base64url')
const KEY_B = Buffer.alloc(32, 2).toString('base64url')

beforeEach(() => {
  resetSecretKeyCache()
  process.env.GW_SECRET_KEY = KEY_A
  delete process.env.GW_SECRET_KEY_FILE
})

afterEach(() => {
  delete process.env.GW_SECRET_KEY
  delete process.env.GW_SECRET_KEY_FILE
  resetSecretKeyCache()
})

describe('encrypting a configured secret', () => {
  it('comes back as what went in', () => {
    const secret = 'smtps://user:pä$$w0rd@relay.example.com:465'
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  it('does not leave the plaintext anywhere in the envelope', () => {
    const envelope = encryptSecret('hochgeheim')
    expect(envelope).not.toContain('hochgeheim')
    expect(Buffer.from(envelope, 'utf8').toString('latin1')).not.toContain('hochgeheim')
  })

  it('produces a different envelope every time, so equal values are not recognisable', () => {
    expect(encryptSecret('dasselbe')).not.toBe(encryptSecret('dasselbe'))
  })

  it('cannot be read with a different key -- a dump alone is not enough', () => {
    const envelope = encryptSecret('smtp-passwort')

    resetSecretKeyCache()
    process.env.GW_SECRET_KEY = KEY_B

    expect(() => decryptSecret(envelope)).toThrow(SecretKeyError)
    // And the message says what actually happened, because the realistic case
    // is a restored backup rather than an attack.
    expect(() => decryptSecret(envelope)).toThrow(/came from a backup/)
  })

  it('refuses a tampered ciphertext instead of decrypting to something else', () => {
    const parts = encryptSecret('original').split('.')
    const [prefix, iv, tag, body] = parts as [string, string, string, string]
    const flipped = Buffer.from(body, 'base64url')
    flipped[0] = (flipped[0] ?? 0) ^ 0xff

    expect(() => decryptSecret([prefix, iv, tag, flipped.toString('base64url')].join('.'))).toThrow(
      SecretKeyError,
    )
  })

  it('accepts a hex key, because that is what `openssl rand -hex 32` prints', () => {
    resetSecretKeyCache()
    process.env.GW_SECRET_KEY = Buffer.alloc(32, 7).toString('hex')
    expect(decryptSecret(encryptSecret('geht'))).toBe('geht')
  })

  it('says so when the key is missing rather than encrypting with nothing', () => {
    resetSecretKeyCache()
    delete process.env.GW_SECRET_KEY
    expect(() => encryptSecret('x')).toThrow(/GW_SECRET_KEY/)
  })

  it('rejects a key of the wrong length instead of padding it', () => {
    resetSecretKeyCache()
    process.env.GW_SECRET_KEY = Buffer.alloc(16, 9).toString('base64url')
    expect(() => encryptSecret('x')).toThrow(/32 Byte/)
  })

  it('reads the key from a file, like every other secret in this stack', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const file = join(mkdtempSync(join(tmpdir(), 'gw-key-')), 'key')
    writeFileSync(file, KEY_A + '\n')

    resetSecretKeyCache()
    delete process.env.GW_SECRET_KEY
    process.env.GW_SECRET_KEY_FILE = file

    expect(decryptSecret(encryptSecret('aus der datei'))).toBe('aus der datei')
  })
})
