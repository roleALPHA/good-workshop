import { authConfig } from '@/server/auth/config'
import type { Edition } from './types'

/**
 * One installation, one tenant, and every answer is that tenant.
 *
 * Deliberately without a database read: this is the behaviour every self-hosted
 * installation has always had, and routing it through a lookup would add a
 * query -- and a way to fail -- to paths that never needed one.
 */
const TENANT = authConfig.defaultTenantId
const always = async () => TENANT

export const communityEdition: Edition = {
  name: 'community',
  tenantForSignIn: always,
  tenantForShareToken: always,
  tenantForClientRegistration: always,
  tenantForAuthorizationCode: always,
  tenantForOAuthToken: always,
  tenantForAnonymousBrand: always,
  tenantForSetup: always,
  tenantAccess: async () => 'full',
  announcedChanges: async () => [],
  // Clients register in the one tenant there is; there is nothing to bring over.
  adoptRegisteredClient: async () => {},
  // A self-hosted installation has no trial, no billing and nobody pausing it.
  workspaceNotice: async () => null,
  hasBilling: false,
}

/** What `@gw/edition` resolves to in a community build. */
export const selectedEdition = communityEdition
