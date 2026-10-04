import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as MailSettings from '@/server/settings/mail-settings'
import type { StoredMail } from '@/server/settings/mail-settings'
import { encryptSecret, resetSecretKeyCache } from '@/server/settings/secretbox'

type MailSettingsModule = typeof MailSettings

/**
 * A cloud workspace with mail of its own, and what happens when it breaks.
 *
 * Its sign-in links go out through its own relay. When that fails, they go out
 * as GoodWorkshop instead -- a broken relay must not lock a whole workspace out,
 * the admin who could repair it included. But it must not go unnoticed either:
 * the failure is written down for the admin page. The test message is the one
 * exception, because finding the failure is what it is for.
 */

const TENANT = '00000000-0000-0000-0000-000000000002'
const MAIL = { to: 'du@example.com', subject: 'Betreff', text: 'Ein Link' }

const ENV_KEYS = ['GW_MAIL_TRANSPORT', 'GW_GRAPH_SENDER', 'SMTP_URL', 'GW_SECRET_KEY'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  // The platform's mail: printed, so the test can see it arrive.
  process.env.GW_MAIL_TRANSPORT = 'console'
  delete process.env.SMTP_URL
  process.env.GW_SECRET_KEY = Buffer.alloc(32, 5).toString('base64url')
  resetSecretKeyCache()
  vi.resetModules()
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function load(stored: StoredMail) {
  const written: StoredMail[] = []
  vi.doMock('@/server/edition', () => ({ edition: { mailPolicy: 'tenant-or-platform' } }))
  vi.doMock('@/server/db', () => ({
    withTenantOnly: async (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn({}),
  }))
  vi.doMock('@/server/settings/mail-settings', async () => {
    const actual = await vi.importActual<MailSettingsModule>('@/server/settings/mail-settings')
    return {
      ...actual,
      readStoredMail: async () => stored,
      writeStoredMail: async (_tx: unknown, _id: string, mail: StoredMail) => {
        written.push(mail)
      },
    }
  })
  const mod = await import('./mail')
  mod.resetGraphTokenCache()
  return { ...mod, written }
}

/** Graph, configured completely -- and refused by Microsoft. A function,
 *  because the secret is encrypted under the key set in beforeEach. */
function ownGraph(): StoredMail {
  return {
    transport: 'graph',
    graphTenantId: 'kunde-tenant',
    graphClientId: 'kunde-client',
    graphClientSecret: { enc: encryptSecret('kunde-secret') },
    graphSender: 'workshops@kunde.example',
  }
}

function graphRefuses() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 })),
  )
}

describe('a workspace with mail of its own', () => {
  it('sends as the platform when its own relay fails, and writes that down', async () => {
    graphRefuses()
    const printed = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { sendMail, written } = await load(ownGraph())
    await sendMail(MAIL, TENANT)

    expect(printed.mock.calls.flat().join(' ')).toContain('du@example.com')
    expect(written).toHaveLength(1)
    expect(written[0]!.lastFallback?.error).toBeTruthy()
    // The mail carries a sign-in link; the warning names the workspace, not it.
    expect(warned.mock.calls.flat().join(' ')).not.toContain('Ein Link')
  })

  it('sends a test message without a fallback, so the failure shows', async () => {
    graphRefuses()
    const printed = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendMailWithoutFallback, written } = await load(ownGraph())
    await expect(sendMailWithoutFallback(MAIL, TENANT)).rejects.toThrow(/401/)

    expect(printed).not.toHaveBeenCalled()
    expect(written).toEqual([])
  })

  it('names a missing value by its field, not by a variable the customer never sees', async () => {
    const { sendMailWithoutFallback } = await load({ ...ownGraph(), graphSender: undefined })

    await expect(sendMailWithoutFallback(MAIL, TENANT)).rejects.toMatchObject({
      params: { field: expect.not.stringContaining('GW_GRAPH_SENDER') },
    })
  })

  it('sends as the platform straight away while nothing is set up', async () => {
    const printed = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendMail, written } = await load({})
    await sendMail(MAIL, TENANT)

    expect(printed).toHaveBeenCalled()
    expect(written).toEqual([])
  })
})
