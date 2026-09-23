/**
 * Where an authorization server keeps its rows -- as a contract, not a table.
 *
 * Two servers run in this codebase. The customers' one keeps clients, codes and
 * tokens in tenant-scoped tables behind row level security, reached as gw_app.
 * The operator console's keeps them in tenant-LESS tables reached as
 * gw_operator, a role with no table grant at all, so every one of its calls is
 * an `app.op_*` function. Nothing above this line may know which it is talking
 * to: PKCE, the single-use code, the rotating refresh token and the audience
 * check are the same in both, and a second copy of them is a second place for
 * one of those to be subtly wrong.
 *
 * Every method is already bound to its connection. A `tx` parameter here would
 * be the tenant side's transaction leaking into an interface the console
 * cannot implement -- it has no transaction to offer, only functions that each
 * do their own work atomically.
 */

import { DomainError } from '@/domain/errors'

/**
 * A registration this server will not accept.
 *
 * Here rather than in repo.ts so that both stores can throw it: the console's
 * implementation must not import the tenant repository, which carries the
 * Drizzle schema of tables gw_operator cannot read.
 */
export class OAuthError extends DomainError {}

export type OAuthClientRow = {
  id: string
  name: string
  redirectUris: string[]
  /** Null for a public client, which is most of them: a CLI can keep no secret. */
  secretHash: string | null
}

/**
 * Who consented, whatever a subject is on this server.
 *
 * A member of a workspace on one side, an operator on the other. The flow
 * never needs to know which -- it carries the id from the code to the token
 * and hands it to whoever resolves a bearer later.
 */
export type OAuthSubject = { subjectId: string }

export type OAuthGrantRow = OAuthSubject & {
  clientId: string
  scopes: string[]
  resource: string
  redirectUri: string
  codeChallenge: string
}

export type OAuthTokenRow = OAuthSubject & {
  clientId: string
  scopes: string[]
  resource: string
}

export type RegisteredClient = {
  id: string
  clientKey: string
  name: string
  redirectUris: string[]
  /** Returned once, at registration, and never readable again. */
  secret?: string
}

export type IssuedTokens = {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  scopes: string[]
}

export type OAuthStore = {
  registerClient(input: {
    name: string
    redirectUris: string[]
    confidential: boolean
  }): Promise<RegisteredClient>

  findClient(clientKey: string): Promise<OAuthClientRow | null>

  /** Spends a code, or answers null. Unknown, expired and already spent are one answer. */
  redeemAuthorizationCode(code: string): Promise<OAuthGrantRow | null>

  issueTokens(input: {
    clientId: string
    subjectId: string
    scopes: string[]
    resource: string
    withRefresh: boolean
  }): Promise<IssuedTokens>

  /** Spends a refresh token and returns what it stood for. Rotated, never reused. */
  redeemRefreshToken(tokenKey: string, secret: string): Promise<OAuthTokenRow | null>

  revoke(tokenKey: string, secret: string): Promise<void>

  /**
   * Whether a string is a token of THIS server, and which kind.
   *
   * On the store rather than in the handler, because the two servers use
   * different prefixes on purpose: an operator's refresh token presented to the
   * customers' token endpoint is refused by its SHAPE, before any lookup, and
   * so is the reverse. A shared parser would turn that into a lookup that
   * happens to miss.
   *
   * The kind comes back because the token endpoint must refuse an ACCESS token
   * offered as a refresh token, while revocation accepts either.
   */
  parseToken(raw: string): { kind: 'access' | 'refresh'; tokenKey: string; secret: string } | null
}
