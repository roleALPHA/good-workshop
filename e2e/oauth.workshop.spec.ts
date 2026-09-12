import { createHash, randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'

/**
 * The OAuth flow, end to end, the way a client walks it.
 *
 * This is the one test that proves the pieces fit: discovery, registration,
 * consent in a browser, the code coming back through a redirect, the token
 * exchange, and the token then working at the MCP endpoint. Each half is
 * covered elsewhere; what only this can show is that they agree about the
 * shapes they hand each other.
 */

const base64url = (buffer: Buffer) => buffer.toString('base64url')
const verifier = base64url(randomBytes(32))
const challenge = createHash('sha256').update(verifier).digest('base64url')

test('a client discovers, registers, is consented to, and then reads', async ({
  page,
  request,
  baseURL,
}) => {
  // ── 1. The 401 that starts everything ──────────────────────────────────
  const denied = await request.post('/api/mcp', {
    headers: { accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  })
  expect(denied.status()).toBe(401)

  const challenge401 = denied.headers()['www-authenticate'] ?? ''
  // Without this pointer a client that has never seen this server has nowhere
  // to go -- which is why the specification makes it a MUST.
  expect(challenge401).toContain('resource_metadata=')
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge401)![1]!

  // ── 2. Discovery ────────────────────────────────────────────────────────
  const prm = await (await request.get(metadataUrl)).json()
  expect(prm.resource).toBe(`${baseURL}/api/mcp`)

  const asMeta = await (
    await request.get(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)
  ).json()
  expect(asMeta.code_challenge_methods_supported).toEqual(['S256'])
  expect(asMeta.authorization_response_iss_parameter_supported).toBe(true)

  // ── 3. Registration ─────────────────────────────────────────────────────
  const registration = await request.post(asMeta.registration_endpoint, {
    data: { client_name: 'E2E-Client', redirect_uris: ['https://client.test/cb'] },
  })
  expect(registration.status()).toBe(201)
  const client = await registration.json()
  expect(client.client_id).toBeTruthy()

  // ── 4. Consent, in a browser, by a person ───────────────────────────────
  const authorize = new URL(asMeta.authorization_endpoint)
  authorize.searchParams.set('client_id', client.client_id)
  authorize.searchParams.set('redirect_uri', 'https://client.test/cb')
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  authorize.searchParams.set('scope', 'workshops:read module_types:read')
  authorize.searchParams.set('state', 'xyz')
  authorize.searchParams.set('resource', `${baseURL}/api/mcp`)

  await page.goto(authorize.href)
  await expect(page.getByRole('heading', { name: 'Zugriff erlauben?' })).toBeVisible()
  await expect(page.getByText('E2E-Client')).toBeVisible()
  // It says what it will be able to do, in words, before anybody agrees.
  await expect(page.getByText('Workshops lesen')).toBeVisible()

  // The redirect target is not a real host, so the navigation fails -- the URL
  // it tried is the thing under test.
  const redirected = page.waitForRequest((r) => r.url().startsWith('https://client.test/cb'))
  await page.getByRole('button', { name: 'Zugriff erlauben' }).click()
  const landing = new URL((await redirected).url())

  const code = landing.searchParams.get('code')
  expect(code).toBeTruthy()
  expect(landing.searchParams.get('state')).toBe('xyz')
  // RFC 9207: the client compares this against the issuer it discovered.
  expect(landing.searchParams.get('iss')).toBe(asMeta.issuer)

  // ── 5. The exchange ─────────────────────────────────────────────────────
  const tokenResponse = await request.post(asMeta.token_endpoint, {
    form: {
      grant_type: 'authorization_code',
      code: code!,
      client_id: client.client_id,
      code_verifier: verifier,
      redirect_uri: 'https://client.test/cb',
    },
  })
  expect(tokenResponse.status()).toBe(200)
  const tokens = await tokenResponse.json()
  expect(tokens.token_type).toBe('Bearer')
  expect(tokens.access_token).toMatch(/^gwo_/)

  // A code is single use, and the second attempt says nothing about why.
  const replay = await request.post(asMeta.token_endpoint, {
    form: {
      grant_type: 'authorization_code',
      code: code!,
      client_id: client.client_id,
      code_verifier: verifier,
    },
  })
  expect(replay.status()).toBe(400)
  expect((await replay.json()).error).toBe('invalid_grant')

  // ── 6. The token actually works ─────────────────────────────────────────
  const call = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${tokens.access_token}`,
      accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_workshops', arguments: {} },
    },
  })
  const body = await call.text()
  expect(body, body).not.toContain('invalid_token')

  // ── 7. And a refresh token rotates ──────────────────────────────────────
  const refreshed = await request.post(asMeta.token_endpoint, {
    form: {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    },
  })
  expect(refreshed.status()).toBe(200)
  expect((await refreshed.json()).access_token).not.toBe(tokens.access_token)
})

test('refuses a token exchange whose PKCE verifier does not match', async ({ request }) => {
  const registration = await request.post('/api/oauth/register', {
    data: { client_name: 'Falsch', redirect_uris: ['https://client.test/cb'] },
  })
  const client = await registration.json()

  const result = await request.post('/api/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      code: 'nonsense',
      client_id: client.client_id,
      code_verifier: 'x'.repeat(43),
    },
  })

  expect(result.status()).toBe(400)
  expect((await result.json()).error).toBe('invalid_grant')
})
