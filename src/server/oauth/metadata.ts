import { authConfig } from '@/server/auth/config'
import { SCOPES } from '@/domain/tenant/tokens'

/**
 * Where this installation says it lives, in the two documents a client reads
 * before it ever sends a token.
 *
 * Both are derived from GW_APP_URL rather than from the incoming request. A
 * metadata document assembled out of the Host header is a metadata document an
 * attacker can point somewhere else -- and these are precisely the documents a
 * client trusts to learn where to send a user's credentials.
 */

/** The canonical audience, as RFC 8707 means it: no trailing slash. */
export const mcpResource = (): string => new URL('/api/mcp', authConfig.appUrl).href

export const issuer = (): string => authConfig.appUrl.origin

/** Where the 401 points a client that has never seen this server. */
export const protectedResourceUrl = (): string =>
  new URL('/.well-known/oauth-protected-resource', authConfig.appUrl).href

/** RFC 9728. The MCP specification makes this one a MUST for the server. */
export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    // The minimum that is still useful, per the specification's scope
    // minimisation note -- a client asks for more through a step-up when it
    // actually needs it, rather than up front because the list was there.
    scopes_supported: ['workshops:read', 'module_types:read'],
    bearer_methods_supported: ['header'],
    resource_documentation: new URL('/settings/tokens', authConfig.appUrl).href,
  }
}

/** RFC 8414, which is one of the two discovery mechanisms a client may expect. */
export function authorizationServerMetadata() {
  const url = (path: string) => new URL(path, authConfig.appUrl).href
  return {
    issuer: issuer(),
    authorization_endpoint: url('/oauth/authorize'),
    token_endpoint: url('/api/oauth/token'),
    registration_endpoint: url('/api/oauth/register'),
    revocation_endpoint: url('/api/oauth/revoke'),
    scopes_supported: [...SCOPES, 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // S256 only. OAuth 2.1 keeps `plain` for clients that cannot hash; a
    // service reachable over HTTPS is not one of those.
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    // RFC 9207: we send `iss` back on the authorization response, so we have to
    // say so -- a client that sees the parameter without this flag has to guess
    // whether to trust it.
    authorization_response_iss_parameter_supported: true,
  }
}
