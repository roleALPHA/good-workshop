import type { Tx } from '@/server/db'

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
/** What the app shell tells a workspace about its own state. Null: nothing to say. */
export type TenantAccess = 'full' | 'read' | 'export'

/** Planned maintenance, as everybody is told about it. */
export type MaintenanceWindow = {
  startsAt: Date
  endsAt: Date
  note: string
}

export type WorkspaceNotice = {
  state: 'trial' | 'read_only' | 'payment_blocked' | 'paused' | 'deleting'
  trialEndsAt: Date | null
  deleteAfter: Date | null
}

/** A price or a text that changes on a day the customer was told about. */
export type AnnouncedChange = {
  kind: 'price' | 'terms'
  effectiveFrom: Date
}

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

  /**
   * Whether the tenant the transaction acts in may change its content. A tenant
   * that may not keeps reading and exporting; every write capability is withheld.
   */
  /**
   * How much of the product this workspace still has.
   *
   * `full` is the normal case. `read` keeps reading and exporting and refuses
   * every change. `export` keeps the way out and nothing else -- a workspace
   * that stopped paying after a reminder. The contents stay the customer's,
   * so the door to them stays open whatever the invoice says.
   */
  tenantAccess(tx: Tx): Promise<TenantAccess>

  /**
   * Makes a self-registered OAuth client known in the tenant the transaction acts
   * in, before the consent screen looks it up there.
   */
  adoptRegisteredClient(tx: Tx, clientKey: string): Promise<void>

  /** For the banner under the header: a trial, a read-only, paused or deleting workspace. */
  workspaceNotice(tenantId: string): Promise<WorkspaceNotice | null>

  /**
   * What has been announced to this workspace and has not happened yet.
   *
   * Separate from the notice above because it is not a state: nothing is
   * withheld, something is coming. Six weeks are a long time to say nothing.
   */
  announcedChanges(tenantId: string): Promise<AnnouncedChange[]>

  /**
   * The next planned maintenance, or the one happening now.
   *
   * Not tenant data -- one window applies to everybody -- which is why it takes
   * no tenant and a self-hosted installation simply has none: whoever runs it
   * plans their own downtime and knows about it.
   */
  maintenanceWindow(): Promise<MaintenanceWindow | null>

  /** Whether tenant admins have a billing page. */
  readonly hasBilling: boolean

  /**
   * Whether this installation has the Discover catalogue.
   *
   * A boolean rather than a way to read the catalogue, and that is the point:
   * `hasBilling` set the precedent, and anything richer would force
   * community.ts to implement a catalogue it does not have. What it is for is
   * the navigation -- the header link and the "start from a design" choice ask
   * this, so that nothing in the application shell has to import from
   * src/cloud, which is what would pull the whole catalogue into a community
   * bundle that CI asserts is free of it.
   */
  readonly hasCatalog: boolean
}
