import { sql } from 'drizzle-orm'
import { withTenantOnly, withoutTenant } from '@/server/db'
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

/**
 * The platform's own tenant, created by drizzle-cloud/0001_one_tenant_per_person.sql.
 * Nobody signs into it. OAuth clients register into it, and mail that belongs to
 * no workspace yet -- a registration's confirmation link -- is sent with its
 * (environment-configured) mail settings.
 */
export const PLATFORM_TENANT = '00000000-0000-0000-0000-00000000c10d'
export const CLIENT_REGISTRY_TENANT = PLATFORM_TENANT

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

  tenantAccess: async (tx) => {
    const result = await tx.execute(sql`select app.cloud_tenant_access() as access`)
    const value = (result as unknown as { rows: { access: string }[] }).rows[0]?.access
    return value === 'read' || value === 'export' ? value : 'full'
  },

  adoptRegisteredClient: async (tx, clientKey) => {
    await tx.execute(sql`select app.cloud_adopt_oauth_client(${clientKey})`)
  },

  workspaceNotice: async (tenantId) => {
    const result = await withTenantOnly(tenantId, (tx) =>
      tx.execute(sql`select state, trial_ends_at, delete_after from tenant_lifecycle`),
    )
    const row = (
      result as unknown as {
        rows: { state: string; trial_ends_at: string | null; delete_after: string | null }[]
      }
    ).rows[0]
    if (!row || row.state === 'active') return null
    return {
      state: row.state as 'trial' | 'read_only' | 'payment_blocked' | 'paused' | 'deleting',
      trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
      deleteAfter: row.delete_after ? new Date(row.delete_after) : null,
    }
  },

  announcedChanges: async (tenantId) => {
    const result = await withTenantOnly(tenantId, (tx) =>
      tx.execute(sql`
        select 'price' as kind, effective_from from price_change_notice
         where effective_from > current_date
        union all
        select 'terms' as kind, effective_from from legal_acknowledgement
         where effective_from > current_date and objected_at is null
         order by effective_from
      `),
    )
    const rows = (result as unknown as { rows: { kind: string; effective_from: string }[] }).rows
    return rows.map((row) => ({
      kind: row.kind === 'terms' ? ('terms' as const) : ('price' as const),
      effectiveFrom: new Date(row.effective_from),
    }))
  },

  maintenanceWindow: async () => {
    // Not through a tenant: the window belongs to the installation, and the
    // query has to answer the same for everybody who asks.
    const result = await withoutTenant((tx) =>
      tx.execute(sql`
        select starts_at, ends_at, note from maintenance_window
         where cancelled_at is null and ends_at > now()
         order by starts_at limit 1
      `),
    )
    const row = (
      result as unknown as { rows: { starts_at: string; ends_at: string; note: string }[] }
    ).rows[0]
    return row
      ? { startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at), note: row.note }
      : null
  },

  hasBilling: true,
}

/** What `@gw/edition` resolves to in a cloud build. */
export const selectedEdition = cloudEdition
