import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { withTenantOnly } from '@/server/db'
import { mailConfigFor, resetGraphTokenCache, sendMail } from '@/server/auth/mail'
import { applyMailSettings, readStoredMail, writeStoredMail } from './mail-settings'
import { resetSecretKeyCache } from './secretbox'

/**
 * Mail per workspace, against the cloud schema.
 *
 * Two workspaces side by side: A has set up mail of its own, B has not. What a
 * second workspace breaks first is that one's settings reach the other -- and
 * the fallback writes into the tenant row, under the same RLS as everything,
 * from a send that has no session at all (a sign-in link).
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const A = randomUUID()
const B = randomUUID()
const MAIL = { to: 'du@example.test', subject: 'Betreff', text: 'Ein Link' }
const ENV_KEYS = ['GW_MAIL_TRANSPORT', 'GW_GRAPH_SENDER', 'SMTP_URL', 'GW_SECRET_KEY'] as const
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

beforeAll(async () => {
  process.env.GW_SECRET_KEY = Buffer.alloc(32, 7).toString('base64url')
  resetSecretKeyCache()
  // The platform's mail: printed, so a fallback is visible.
  process.env.GW_MAIL_TRANSPORT = 'console'
  delete process.env.SMTP_URL

  await ops.connect()
  for (const [id, slug] of [
    [A, `mail-a-${A.slice(0, 8)}`],
    [B, `mail-b-${B.slice(0, 8)}`],
  ]) {
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Mailtest')`, [id, slug])
  }

  await withTenantOnly(A, (tx) =>
    writeStoredMail(
      tx,
      A,
      applyMailSettings(
        {},
        {
          transport: 'graph',
          graphTenantId: 'kunde-tenant',
          graphClientId: 'kunde-client',
          graphClientSecret: 'kunde-secret',
          graphSender: 'workshops@kunde.example',
        },
      ),
    ),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetGraphTokenCache()
})

afterAll(async () => {
  await ops.query('delete from tenant where id = any($1::uuid[])', [[A, B]])
  await ops.end()
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetSecretKeyCache()
})

describe('mail per workspace', () => {
  it('sends as the workspace that set it up, and as the platform for the one that did not', async () => {
    const a = await mailConfigFor(A)
    const b = await mailConfigFor(B)

    expect(a).toMatchObject({ owner: 'tenant', graphSender: 'workshops@kunde.example' })
    expect(b).toMatchObject({ owner: 'platform', transport: 'console' })
    expect(b.graphSender).toBeUndefined()
  })

  it('falls back when the own relay fails, and notes it on that workspace only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 })),
    )
    const printed = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await sendMail(MAIL, A)

    expect(printed.mock.calls.flat().join(' ')).toContain('du@example.test')
    const storedA = await withTenantOnly(A, (tx) => readStoredMail(tx, A))
    const storedB = await withTenantOnly(B, (tx) => readStoredMail(tx, B))
    expect(storedA.lastFallback?.error).toContain('401')
    // The rest of A's settings survive the note.
    expect(storedA.graphSender).toBe('workshops@kunde.example')
    expect(storedB.lastFallback).toBeUndefined()
  })

  it('cannot read another workspace’s settings from inside one', async () => {
    // The tenant row is the one table that IS the tenant; its RLS policy is
    // what keeps A's relay credentials out of B's reach.
    const seen = await withTenantOnly(B, (tx) => readStoredMail(tx, A))
    expect(seen).toEqual({})
  })
})
