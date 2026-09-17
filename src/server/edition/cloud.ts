import { sql } from 'drizzle-orm'
import { withoutTenant } from '@/server/db'
import type { Edition } from './types'

/**
 * Many tenants, one per person, and every answer read off the credential.
 *
 * Each question goes to a SECURITY DEFINER function in
 * drizzle-cloud/sql/950_cloud_resolvers.sql, which returns a tenant id and
 * nothing else; the rows themselves are then read inside that tenant, under its
 * policies. Only reachable in a build made with GW_EDITION=cloud -- a community
 * image does not contain this file.
 */

/** Created by drizzle-cloud/0001_one_tenant_per_person.sql. */
export const CLIENT_REGISTRY_TENANT = '00000000-0000-0000-0000-00000000c10d'

async function ask(query: ReturnType<typeof sql>): Promise<string | null> {
  const result = await withoutTenant((tx) => tx.execute(query))
  const row = (result as unknown as { rows: { tenant_id: string | null }[] }).rows[0]
  return row?.tenant_id ?? null
}

export const cloudEdition: Edition = {
  name: 'cloud',

  tenantForSignIn: (identityId) =>
    ask(sql`select app.cloud_tenant_for_identity(${identityId}::uuid) as tenant_id`),

  tenantForShareToken: (tokenHash) =>
    ask(sql`select app.cloud_tenant_for_share_token(${tokenHash}) as tenant_id`),

  tenantForClientRegistration: async () => CLIENT_REGISTRY_TENANT,

  tenantForAuthorizationCode: (codeHash) =>
    ask(sql`select app.cloud_tenant_for_authorization_code(${codeHash}) as tenant_id`),

  tenantForOAuthToken: (tokenKey) =>
    ask(sql`select app.cloud_tenant_for_oauth_token(${tokenKey}) as tenant_id`),

  // Nobody's branding before sign-in: a visitor on the login page has not said
  // which organisation they belong to, and guessing would show one customer's
  // logo to another's staff.
  tenantForAnonymousBrand: async () => null,

  // Tenants come from registration, not from claiming an installation.
  tenantForSetup: async () => null,
}

/** What `@gw/edition` resolves to in a cloud build. */
export const selectedEdition = cloudEdition
