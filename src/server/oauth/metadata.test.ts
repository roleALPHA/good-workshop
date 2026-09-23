import { afterEach, describe, expect, it, vi } from 'vitest'
import { OAUTH_SCOPES, narrowTo } from '@/domain/oauth/rules'
import { OPERATOR_OAUTH_SCOPES, OPERATOR_SCOPES } from '@/server/operator/scopes'
import {
  authorizationServerMetadata,
  currentProfile,
  operatorProfile,
  protectedResourceMetadata,
  tenantProfile,
  unauthorizedChallenge,
} from './metadata'

/**
 * The two places a client learns which scopes to ask for.
 *
 * A client reads them before it has ever seen the consent screen, and asks for
 * exactly what they name. When both said "read", Claude and ChatGPT asked for
 * reading, were granted reading, and every write tool they were shown failed.
 * The server would have granted writing all along -- nobody had told the
 * client it was on offer.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('what a client is told it may ask for', () => {
  it('lists the offered scopes in the protected resource metadata', () => {
    vi.stubEnv('GW_APP_URL', 'https://ws.example.com')
    expect(protectedResourceMetadata().scopes_supported).toEqual(OAUTH_SCOPES)
  })

  it('names the same scopes in the 401 that starts the flow', () => {
    vi.stubEnv('GW_APP_URL', 'https://ws.example.com')
    const challenge = unauthorizedChallenge()

    expect(challenge).toContain(`scope="${OAUTH_SCOPES.join(' ')}"`)
    expect(challenge).toContain('workshops:write')
    expect(challenge).toContain(
      'resource_metadata="https://ws.example.com/.well-known/oauth-protected-resource"',
    )
  })
})

/**
 * The console's authorization server, and the one thing its addresses have to
 * be true about.
 *
 * deploy/Caddyfile serves ops.goodworkshop.org from the tailnet only, and
 * within that forwards `/operator` and `/operator/*` to the console container
 * while redirecting EVERYTHING ELSE to /operator/login. An endpoint published
 * outside that prefix would therefore answer a token request with an HTML
 * login page and HTTP 200 -- no error, no clue, and a client that hangs. The
 * two `.well-known` documents are the deliberate exception: RFC 8414 and 9728
 * fix where they live, and the Caddyfile names them for exactly this reason.
 */
describe('the operator authorization server', () => {
  const ops = () => {
    vi.stubEnv('GW_APP_URL', 'https://ops.example.com')
    return operatorProfile()
  }

  it('publishes every endpoint under /operator, which is all the proxy forwards', () => {
    const profile = ops()
    const endpoints = [
      profile.resource,
      profile.authorizationEndpoint,
      profile.tokenEndpoint,
      profile.registrationEndpoint,
      profile.revocationEndpoint,
      profile.documentation,
    ]

    for (const endpoint of endpoints) {
      expect(new URL(endpoint).pathname.startsWith('/operator/')).toBe(true)
    }
  })

  it('keeps the two discovery documents at the root, where the RFCs put them', () => {
    // Not under /operator, and deploy/Caddyfile has a matcher for them.
    expect(new URL(ops().protectedResourceUrl).pathname).toBe(
      '/.well-known/oauth-protected-resource',
    )
  })

  it("never names the customers' endpoints, which the same image also serves", () => {
    vi.stubEnv('GW_APP_URL', 'https://ops.example.com')
    const document = authorizationServerMetadata(operatorProfile())

    // The console container has /api/oauth/* and /oauth/authorize on disk --
    // it is one image -- and Caddy forwards neither. Naming one here would
    // send a client to a page it cannot use, under a name that resolves.
    for (const endpoint of [
      document.authorization_endpoint,
      document.token_endpoint,
      document.registration_endpoint,
      document.revocation_endpoint,
    ]) {
      expect(new URL(endpoint).pathname).toMatch(/^\/operator\//u)
    }
  })

  it('offers everything but the destructive scope', () => {
    // A permission that can arrive by omission is a permission nobody chose.
    expect(ops().offered).not.toContain('ops:danger')
    expect(narrowTo(null, OPERATOR_SCOPES, OPERATOR_OAUTH_SCOPES)).not.toContain('ops:danger')
    // Asked for by name, it is still available -- this is a default, not a ban.
    expect(narrowTo('ops:read ops:danger', OPERATOR_SCOPES, OPERATOR_OAUTH_SCOPES)).toContain(
      'ops:danger',
    )
  })

  it("does not leak an operator scope into the customers' server", () => {
    vi.stubEnv('GW_APP_URL', 'https://ws.example.com')
    expect(tenantProfile().vocabulary).not.toContain('ops:danger')
    // Not a bare 'ops:' -- "workshops:read" contains that, which is how this
    // assertion first failed and why it names the scope in full.
    expect(unauthorizedChallenge(tenantProfile())).not.toContain('ops:danger')
    expect(unauthorizedChallenge(tenantProfile())).not.toContain('catalog:')
  })
})

describe('which server this process is', () => {
  it("is the customers' one unless the console is switched on", () => {
    vi.stubEnv('GW_APP_URL', 'https://ws.example.com')
    expect(currentProfile().resource).toBe('https://ws.example.com/api/mcp')
  })

  it("is the console's when the process is the console", () => {
    // Both variables, because operatorConsoleEnabled() wants both: a flag
    // without a connection string is a console that cannot reach anything.
    vi.stubEnv('GW_APP_URL', 'https://ops.example.com')
    vi.stubEnv('GW_OPERATOR_CONSOLE', '1')
    vi.stubEnv('OPERATOR_DATABASE_URL', 'postgres://gw_operator@localhost/gw')

    expect(currentProfile().resource).toBe('https://ops.example.com/operator/api/mcp')
  })
})
