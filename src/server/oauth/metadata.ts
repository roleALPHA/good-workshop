import { authConfig } from '@/server/auth/config'
import { OAUTH_SCOPES } from '@/domain/oauth/rules'
import { SCOPES } from '@/domain/tenant/tokens'
import { operatorConsoleEnabled } from '@/server/operator/enabled'
import { OPERATOR_OAUTH_SCOPES, OPERATOR_SCOPES } from '@/server/operator/scopes'

/**
 * Where this installation says it lives, in the two documents a client reads
 * before it ever sends a token.
 *
 * Both are derived from GW_APP_URL rather than from the incoming request. A
 * metadata document assembled out of the Host header is a metadata document an
 * attacker can point somewhere else -- and these are precisely the documents a
 * client trusts to learn where to send a user's credentials.
 *
 * TWO AUTHORIZATION SERVERS RUN OUT OF THIS FILE, and nothing about them is
 * duplicated but their paths. The customers' one is goodworkshop.org; the
 * operator console's is ops.goodworkshop.org, which is the SAME IMAGE started
 * with GW_OPERATOR_CONSOLE=1 and with GW_APP_URL pointing at the console's own
 * name (deploy/compose.yaml sets both). So `authConfig.appUrl` already answers
 * correctly in each process, and which profile applies is a property of the
 * process rather than of the request -- see `currentProfile`.
 */

/** Everything a profile differs in. Every field an absolute URL or a scope list. */
export type OAuthProfile = {
  realm: string
  issuer: string
  /** The canonical audience, as RFC 8707 means it: no trailing slash. */
  resource: string
  protectedResourceUrl: string
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint: string
  revocationEndpoint: string
  documentation: string
  /** What a request naming no scope receives, and what the 401 tells a client to ask for. */
  offered: readonly string[]
  /** Everything the server understands, for the authorization server document. */
  vocabulary: readonly string[]
}

const at = (path: string): string => new URL(path, authConfig.appUrl).href

export function tenantProfile(): OAuthProfile {
  return {
    realm: 'GoodWorkshop',
    issuer: authConfig.appUrl.origin,
    resource: at('/api/mcp'),
    protectedResourceUrl: at('/.well-known/oauth-protected-resource'),
    authorizationEndpoint: at('/oauth/authorize'),
    tokenEndpoint: at('/api/oauth/token'),
    registrationEndpoint: at('/api/oauth/register'),
    revocationEndpoint: at('/api/oauth/revoke'),
    documentation: at('/settings/ai-connection'),
    offered: OAUTH_SCOPES,
    vocabulary: [...SCOPES, 'offline_access'],
  }
}

/**
 * The console's own authorization server.
 *
 * Every endpoint sits under /operator, and that is not cosmetic: the Caddy
 * block for ops.goodworkshop.org forwards /operator and /operator/* to the
 * console container and redirects everything else to the login page. An
 * endpoint anywhere else would answer a token request with HTML and no error
 * anybody could read. The two `.well-known` documents are the exception --
 * their location is fixed by RFC 8414 and 9728 -- and deploy/Caddyfile names
 * them explicitly for exactly that reason.
 */
export function operatorProfile(): OAuthProfile {
  return {
    realm: 'GoodWorkshop operator',
    issuer: authConfig.appUrl.origin,
    resource: at('/operator/api/mcp'),
    protectedResourceUrl: at('/.well-known/oauth-protected-resource'),
    authorizationEndpoint: at('/operator/oauth/authorize'),
    tokenEndpoint: at('/operator/api/oauth/token'),
    registrationEndpoint: at('/operator/api/oauth/register'),
    revocationEndpoint: at('/operator/api/oauth/revoke'),
    documentation: at('/operator/security'),
    offered: OPERATOR_OAUTH_SCOPES,
    vocabulary: [...OPERATOR_SCOPES, 'offline_access'],
  }
}

/**
 * Which of the two this process serves.
 *
 * The console container has the customers' routes on disk as well -- one image
 * -- but Caddy never forwards them there, and a client that reached them would
 * be told about an authorization server whose consent screen needs a tenant
 * session the operator does not have. Answering as the console is what makes
 * the documents on ops.goodworkshop.org describe ops.goodworkshop.org.
 */
export function currentProfile(): OAuthProfile {
  return operatorConsoleEnabled() ? operatorProfile() : tenantProfile()
}

export const mcpResource = (): string => tenantProfile().resource

export const issuer = (): string => authConfig.appUrl.origin

/** Where the 401 points a client that has never seen this server. */
export const protectedResourceUrl = (): string => tenantProfile().protectedResourceUrl

/** RFC 9728. The MCP specification makes this one a MUST for the server. */
export function protectedResourceMetadata(profile: OAuthProfile = tenantProfile()) {
  return {
    resource: profile.resource,
    authorization_servers: [profile.issuer],
    // What a client should ask for, and it asks for exactly this. Reading alone
    // left Claude and ChatGPT unable to write anything; see OAUTH_SCOPES.
    scopes_supported: [...profile.offered],
    bearer_methods_supported: ['header'],
    resource_documentation: profile.documentation,
  }
}

/**
 * The WWW-Authenticate value of a 401 from an MCP endpoint.
 *
 * `resource_metadata` is what turns a 401 into a way forward -- RFC 9728, and a
 * MUST in the MCP specification: a client that has never seen this server
 * follows the pointer, finds the authorization server and starts the flow.
 * `scope` is what it will ask for there, so it names the same list the metadata
 * does.
 */
export function unauthorizedChallenge(profile: OAuthProfile = tenantProfile()): string {
  return (
    `Bearer realm="${profile.realm}", error="invalid_token", ` +
    `resource_metadata="${profile.protectedResourceUrl}", ` +
    `scope="${profile.offered.join(' ')}"`
  )
}

/** RFC 8414, which is one of the two discovery mechanisms a client may expect. */
export function authorizationServerMetadata(profile: OAuthProfile = tenantProfile()) {
  return {
    issuer: profile.issuer,
    authorization_endpoint: profile.authorizationEndpoint,
    token_endpoint: profile.tokenEndpoint,
    registration_endpoint: profile.registrationEndpoint,
    revocation_endpoint: profile.revocationEndpoint,
    scopes_supported: [...profile.vocabulary],
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
