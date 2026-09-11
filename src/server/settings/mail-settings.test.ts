import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encryptSecret, resetSecretKeyCache } from './secretbox'
import {
  applyMailSettings,
  describeMailSettings,
  resolveMailConfig,
  type StoredMail,
} from './mail-settings'

/**
 * Which value wins, and what the browser is allowed to see.
 *
 * These are the rules an operator relies on without reading the code: that a
 * value in the environment is not silently overwritten by one in the database,
 * that leaving a password field blank does not wipe the password, and that a
 * stored credential never travels back to the form.
 */

const KEY = Buffer.alloc(32, 3).toString('base64url')

beforeEach(() => {
  resetSecretKeyCache()
  process.env.GW_SECRET_KEY = KEY
})

afterEach(() => {
  delete process.env.GW_SECRET_KEY
  resetSecretKeyCache()
})

describe('resolving what the transport uses', () => {
  it('prefers the environment and says which fields it dictated', () => {
    const stored: StoredMail = { transport: 'smtp', smtpFrom: 'db@example.com' }
    const config = resolveMailConfig(stored, {
      GW_MAIL_TRANSPORT: 'graph',
      SMTP_FROM: 'env@example.com',
    })

    expect(config.transport).toBe('graph')
    expect(config.smtpFrom).toBe('env@example.com')
    expect(config.fromEnvironment).toEqual(expect.arrayContaining(['transport', 'smtpFrom']))
  })

  it('falls back to the stored value when the environment is silent', () => {
    const config = resolveMailConfig({ transport: 'smtp', smtpFrom: 'db@example.com' }, {})

    expect(config.transport).toBe('smtp')
    expect(config.smtpFrom).toBe('db@example.com')
    expect(config.fromEnvironment).toEqual([])
  })

  it('decrypts a stored credential', () => {
    const stored: StoredMail = { graphClientSecret: { enc: encryptSecret('graph-geheim') } }
    expect(resolveMailConfig(stored, {}).graphClientSecret).toBe('graph-geheim')
  })

  it('survives a dump restored without its key: no credential, but mail still configured', () => {
    const stored: StoredMail = {
      transport: 'graph',
      graphSender: 'no-reply@example.com',
      graphClientSecret: { enc: encryptSecret('graph-geheim') },
    }

    resetSecretKeyCache()
    process.env.GW_SECRET_KEY = Buffer.alloc(32, 9).toString('base64url')

    const config = resolveMailConfig(stored, {})
    // Not a crash on the login page: the operator sees an empty credential and
    // can type it again.
    expect(config.graphClientSecret).toBeUndefined()
    expect(config.transport).toBe('graph')
    expect(config.graphSender).toBe('no-reply@example.com')
  })

  it('treats an unparseable settings blob as empty rather than failing', () => {
    const config = resolveMailConfig({ transport: undefined }, {})
    expect(config.transport).toBe('none')
  })
})

describe('applying a form submission', () => {
  it('keeps the existing secret when the field was left blank', () => {
    const before: StoredMail = { graphClientSecret: { enc: encryptSecret('alt') } }
    const after = applyMailSettings(before, { transport: 'graph', graphClientSecret: '' })

    expect(after.graphClientSecret).toEqual(before.graphClientSecret)
    expect(resolveMailConfig(after, {}).graphClientSecret).toBe('alt')
  })

  it('replaces the secret when a new one was typed', () => {
    const before: StoredMail = { graphClientSecret: { enc: encryptSecret('alt') } }
    const after = applyMailSettings(before, { transport: 'graph', graphClientSecret: 'neu' })

    expect(resolveMailConfig(after, {}).graphClientSecret).toBe('neu')
  })

  it('stores secrets encrypted, never in the clear', () => {
    const after = applyMailSettings({}, { transport: 'smtp', smtpUrl: 'smtps://u:p@relay' })
    expect(JSON.stringify(after)).not.toContain('smtps://u:p@relay')
  })
})

describe('what the form is shown', () => {
  it('reports that a secret exists without revealing it', () => {
    const stored = applyMailSettings({}, { transport: 'graph', graphClientSecret: 'geheim' })
    const view = describeMailSettings(stored, resolveMailConfig(stored, {}))

    expect(view.hasGraphClientSecret).toBe(true)
    expect(JSON.stringify(view)).not.toContain('geheim')
  })

  it('names the fields the environment fixes, so the form can lock them', () => {
    const config = resolveMailConfig({}, { GW_MAIL_TRANSPORT: 'console' })
    expect(describeMailSettings({}, config).fromEnvironment).toContain('transport')
  })
})
