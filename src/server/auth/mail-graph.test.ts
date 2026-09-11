import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Microsoft Graph transport.
 *
 * Worth its own file: it is the one transport that talks to a remote service,
 * and the things that can go wrong with it -- a stale token, a secret echoed
 * into a log, a failure that reads as success -- are invisible until somebody
 * cannot log in.
 */

const ENV_KEYS = [
  'GW_MAIL_TRANSPORT',
  'GW_GRAPH_TENANT_ID',
  'GW_GRAPH_CLIENT_ID',
  'GW_GRAPH_CLIENT_SECRET',
  'GW_GRAPH_CLIENT_SECRET_FILE',
  'GW_GRAPH_SENDER',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  process.env.GW_MAIL_TRANSPORT = 'graph'
  process.env.GW_GRAPH_TENANT_ID = 'contoso.onmicrosoft.com'
  process.env.GW_GRAPH_CLIENT_ID = 'client-id'
  process.env.GW_GRAPH_CLIENT_SECRET = 'client-secret'
  process.env.GW_GRAPH_SENDER = 'workshop@contoso.com'
  delete process.env.GW_GRAPH_CLIENT_SECRET_FILE
  vi.resetModules()
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
})

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 })
}

/** The recorded fetch calls, typed -- `mock.calls` is `any[][]`, and under
 *  noUncheckedIndexedAccess every index into it needs a guard otherwise. */
type Call = [string, { headers: Record<string, string>; body: string }]

function callsOf(mock: { mock: { calls: unknown[][] } }): Call[] {
  return mock.mock.calls as Call[]
}

function tokenCalls(mock: { mock: { calls: unknown[][] } }): Call[] {
  return callsOf(mock).filter((call) => String(call[0]).includes('login.microsoftonline.com'))
}

async function load() {
  const mod = await import('./mail')
  mod.resetGraphTokenCache()
  return mod
}

const MAIL = { to: 'du@example.com', subject: 'Betreff', text: 'Zeile' }

describe('sending through Graph', () => {
  it('gets a token, then posts the message as that sender', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'token-1', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    const { sendMail } = await load()
    await sendMail(MAIL)

    const [token, send] = callsOf(fetchMock)
    const [tokenUrl, tokenInit] = token!
    expect(tokenUrl).toContain('login.microsoftonline.com/contoso.onmicrosoft.com')
    expect(String(tokenInit.body)).toContain('grant_type=client_credentials')

    const [sendUrl, sendInit] = send!
    // The sender is part of the PATH, so an address with a + or a # has to
    // survive the trip rather than end the URL early.
    expect(sendUrl).toBe('https://graph.microsoft.com/v1.0/users/workshop%40contoso.com/sendMail')
    expect(sendInit.headers.authorization).toBe('Bearer token-1')
    expect(JSON.parse(sendInit.body)).toMatchObject({
      message: {
        subject: 'Betreff',
        toRecipients: [{ emailAddress: { address: 'du@example.com' } }],
      },
      saveToSentItems: false,
    })
  })

  it('reuses the token for the next mail instead of asking again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'token-1', expires_in: 3600 }))
      .mockResolvedValue(new Response('', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    const { sendMail } = await load()
    await sendMail(MAIL)
    await sendMail(MAIL)

    expect(tokenCalls(fetchMock)).toHaveLength(1)
  })

  it('asks again once the token is close to expiring', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'token-1', expires_in: 30 }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(ok({ access_token: 'token-2', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    const { sendMail } = await load()
    await sendMail(MAIL)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    await sendMail(MAIL)

    expect(tokenCalls(fetchMock)).toHaveLength(2)
  })

  it('fails loudly when Graph rejects the message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'token-1', expires_in: 3600 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Access denied' } }), { status: 403 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { sendMail } = await load()
    await expect(sendMail(MAIL)).rejects.toThrow(/403.*Access denied/)
  })

  it('never puts the client secret into the error it throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'invalid_client', error_description: 'Secret is expired' }),
          { status: 401 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { sendMail } = await load()
    const error = await sendMail(MAIL).catch((e: Error) => e)

    expect(String(error)).toContain('Secret is expired')
    expect(String(error)).not.toContain('client-secret')
  })

  it('reads the secret from a file when one is configured', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const file = join(mkdtempSync(join(tmpdir(), 'gw-graph-')), 'secret')
    writeFileSync(file, 'from-file\n')

    delete process.env.GW_GRAPH_CLIENT_SECRET
    process.env.GW_GRAPH_CLIENT_SECRET_FILE = file

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'token-1', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    const { sendMail } = await load()
    await sendMail(MAIL)

    // Trimmed: a file written by `echo` ends in a newline, and a newline in a
    // form body is a credential that does not match.
    expect(String(callsOf(fetchMock)[0]![1].body)).toContain('client_secret=from-file&')
  })

  it('says which value is missing rather than failing at the request', async () => {
    delete process.env.GW_GRAPH_SENDER
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('should not have been called')
      }),
    )

    const { sendMail } = await load()
    await expect(sendMail(MAIL)).rejects.toThrow(/GW_GRAPH_SENDER/)
  })

  it('counts as delivery to the recipient, unlike console', async () => {
    const { deliversToRecipient } = await load()
    expect(deliversToRecipient()).toBe(true)
  })
})
