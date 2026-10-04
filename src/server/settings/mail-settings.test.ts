import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encryptSecret, resetSecretKeyCache } from './secretbox'
import {
  applyMailSettings,
  describeMailSettings,
  mailSettingsInput,
  mailSettingsProblem,
  recordMailFallback,
  resolveMailConfig,
  resolveTenantMail,
  type MailEnv,
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

  it('accepts a submission without a transport when the environment dictates it', () => {
    // The form disables the radio buttons for a transport set in the
    // environment, and a disabled input is not submitted. That is the documented
    // installation: GW_MAIL_TRANSPORT in the .env, SMTP_URL typed in here.
    const parsed = mailSettingsInput.safeParse({ smtpUrl: 'smtp://u:p@relay:587' })
    expect(parsed.success).toBe(true)

    const after = applyMailSettings({ transport: 'console' }, parsed.data!)
    expect(after.transport).toBe('console')
    expect(resolveMailConfig(after, { GW_MAIL_TRANSPORT: 'smtp' }).smtpUrl).toBe(
      'smtp://u:p@relay:587',
    )
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

/**
 * The cloud: one platform, many workspaces, each with mail of its own or none.
 *
 * There the environment is the PLATFORM's mail, not a lock on everybody's form.
 * A workspace that set nothing up sends as GoodWorkshop; one that did sends as
 * itself, and nothing of the platform's configuration leaks into it -- not a
 * value, not an id on the form.
 */
const PLATFORM: MailEnv = {
  GW_MAIL_TRANSPORT: 'graph',
  GW_GRAPH_TENANT_ID: 'platform-tenant',
  GW_GRAPH_CLIENT_ID: 'platform-client',
  GW_GRAPH_CLIENT_SECRET: 'platform-secret',
  GW_GRAPH_SENDER: 'no-reply@goodworkshop.org',
}

describe('mail per workspace (cloud)', () => {
  it('sends as the platform while the workspace has set nothing up', () => {
    const config = resolveTenantMail({}, PLATFORM, 'tenant-or-platform')

    expect(config.owner).toBe('platform')
    expect(config.graphSender).toBe('no-reply@goodworkshop.org')
  })

  it('sends as the workspace once it has, without a single platform value mixed in', () => {
    const stored = applyMailSettings(
      {},
      {
        transport: 'graph',
        graphTenantId: 'kunde-tenant',
        graphClientId: 'kunde-client',
        graphSender: 'workshops@kunde.example',
      },
    )
    const config = resolveTenantMail(stored, PLATFORM, 'tenant-or-platform')

    expect(config.owner).toBe('tenant')
    expect(config.graphSender).toBe('workshops@kunde.example')
    // No secret typed: missing, and NOT the platform's. Filling it up from the
    // environment would let a workspace send through our registration.
    expect(config.graphClientSecret).toBeUndefined()
    expect(config.fromEnvironment).toEqual([])
  })

  it('treats a server-log or no-delivery setting as nothing set up', () => {
    // Neither belongs to a customer: one prints their sign-in links into our
    // log, the other locks them out.
    for (const transport of ['console', 'none'] as const) {
      expect(resolveTenantMail({ transport }, PLATFORM, 'tenant-or-platform').owner).toBe(
        'platform',
      )
    }
  })

  it('leaves a self-hosted installation exactly as it was', () => {
    const stored: StoredMail = { transport: 'smtp', smtpFrom: 'db@example.com' }
    const config = resolveTenantMail(stored, PLATFORM, 'environment-wins')

    expect(config).toEqual({ ...resolveMailConfig(stored, PLATFORM), owner: 'installation' })
  })

  it('never shows a workspace the platform ids, only the address it sends from', () => {
    const config = resolveTenantMail({}, PLATFORM, 'tenant-or-platform')
    const view = describeMailSettings({}, config, 'tenant-or-platform')

    expect(view.transport).toBe('platform')
    expect(view.platformSender).toBe('no-reply@goodworkshop.org')
    expect(view.fromEnvironment).toEqual([])
    expect(JSON.stringify(view)).not.toMatch(/platform-tenant|platform-client|platform-secret/)
    expect(view.hasGraphClientSecret).toBe(false)
  })

  it('goes back to the platform when the workspace chooses it', () => {
    const own = applyMailSettings({}, { transport: 'smtp', smtpFrom: 'a@kunde.example' })
    const back = applyMailSettings(own, { transport: 'platform' })

    expect(back.transport).toBeUndefined()
    // What was typed stays, so switching back is one click, not a re-entry.
    expect(back.smtpFrom).toBe('a@kunde.example')
    expect(resolveTenantMail(back, PLATFORM, 'tenant-or-platform').owner).toBe('platform')
  })

  it('refuses the server log and no delivery in the cloud, and the platform outside it', () => {
    expect(mailSettingsProblem({ transport: 'console' }, 'tenant-or-platform')).toBeTruthy()
    expect(mailSettingsProblem({ transport: 'none' }, 'tenant-or-platform')).toBeTruthy()
    expect(mailSettingsProblem({ transport: 'graph' }, 'tenant-or-platform')).toBeNull()
    expect(mailSettingsProblem({ transport: 'platform' }, 'environment-wins')).toBeTruthy()
    expect(mailSettingsProblem({ transport: 'console' }, 'environment-wins')).toBeNull()
  })

  it('remembers a fallback until the next save, so a broken relay does not go unnoticed', () => {
    const failed = recordMailFallback(
      { transport: 'smtp' },
      new Date('2026-10-04T08:00:00Z'),
      'Connection refused\nsecond line ' + 'x'.repeat(1000),
    )

    expect(failed.lastFallback?.at).toBe('2026-10-04T08:00:00.000Z')
    expect(failed.lastFallback?.error).not.toContain('\n')
    expect(failed.lastFallback!.error.length).toBeLessThanOrEqual(300)
    expect(describeMailSettings(failed, resolveMailConfig(failed, {})).lastFallback).toEqual(
      failed.lastFallback,
    )

    expect(applyMailSettings(failed, { transport: 'smtp' }).lastFallback).toBeUndefined()
  })
})
