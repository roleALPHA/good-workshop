/**
 * The questions whose answer depends on how many tenants an installation has.
 *
 * Every one of them is asked at a moment when no tenant is known yet: somebody
 * signing in, a guest following a share link, an OAuth client that has not
 * authenticated, a logged-out visitor looking at the login page. Inside a
 * request that already has a tenant -- a session, a personal access token, a
 * guest cookie -- nothing here is consulted; the tenant comes with the
 * credential.
 *
 * The Community Edition answers all of them with its one fixed tenant, without
 * touching the database (see ./community.ts). A multi-tenant edition answers
 * them from the credential in hand. Code outside this directory never names a
 * tenant id of its own -- src/server/edition/edition.test.ts holds that line.
 */
export type Edition = {
  readonly name: 'community' | 'cloud'

  /** The tenant a sign-in by this identity opens, or null if it opens none. */
  tenantForSignIn(identityId: string): Promise<string | null>

  /** The tenant a guest share link lives in, by the hash of its token. */
  tenantForShareToken(tokenHash: string): Promise<string | null>

  /** Where a client that registers itself (RFC 7591) is written. */
  tenantForClientRegistration(): Promise<string>

  /** The tenant an OAuth authorization code was issued in, by its hash. */
  tenantForAuthorizationCode(codeHash: string): Promise<string | null>

  /** The tenant an OAuth access or refresh token belongs to, by its public key. */
  tenantForOAuthToken(tokenKey: string): Promise<string | null>

  /**
   * Whose branding a visitor without a session sees -- the login page, the
   * verify page. Null means none: a neutral product mark.
   */
  tenantForAnonymousBrand(): Promise<string | null>

  /**
   * The tenant first-run setup claims, or null where an installation is not
   * claimed through /setup at all.
   */
  tenantForSetup(): Promise<string | null>
}
