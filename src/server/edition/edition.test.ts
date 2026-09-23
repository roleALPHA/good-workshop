import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { authConfig } from '@/server/auth/config'
import { communityEdition } from './community'

/**
 * The seam, and the line around it.
 *
 * The second test is the one that matters over time: a tenant id named directly
 * in application code is a place where a second tenant would silently land in
 * the first one. It is a test rather than a lint rule because the project's
 * `no-restricted-syntax` entries replace each other per glob -- see the note in
 * eslint.config.mjs -- and a guardrail that another block can switch off is not
 * one.
 */

describe('the community edition', () => {
  it.each([
    ['tenantForSignIn', () => communityEdition.tenantForSignIn('any-identity')],
    ['tenantForShareToken', () => communityEdition.tenantForShareToken('any-hash')],
    ['tenantForClientRegistration', () => communityEdition.tenantForClientRegistration()],
    ['tenantForAuthorizationCode', () => communityEdition.tenantForAuthorizationCode('any-hash')],
    ['tenantForOAuthToken', () => communityEdition.tenantForOAuthToken('any-key')],
    ['tenantForAnonymousBrand', () => communityEdition.tenantForAnonymousBrand()],
    ['tenantForSetup', () => communityEdition.tenantForSetup()],
  ])('answers %s with the one fixed tenant', async (_, ask) => {
    await expect(ask()).resolves.toBe(authConfig.defaultTenantId)
  })

  it('never restricts writing, and has no client registry to adopt from', async () => {
    // No transaction is passed because none is touched: the community edition
    // answers without a query.
    const noTx = undefined as never
    await expect(communityEdition.tenantAccess(noTx)).resolves.toBe('full')
    await expect(communityEdition.adoptRegisteredClient(noTx, 'any')).resolves.toBeUndefined()
    await expect(communityEdition.workspaceNotice('any-tenant')).resolves.toBeNull()
    expect(communityEdition.hasBilling).toBe(false)
  })

  /**
   * The banners the cloud grew: a price or terms change six weeks ahead, and a
   * maintenance window for the installation. A self-hosted installation has
   * neither -- nobody announces terms to themselves -- and each of these is a
   * query away from a table that only the cloud schema has. Answering "nothing"
   * without asking is what keeps the community edition from needing it.
   */
  it('announces nothing, because there is nobody to announce to', async () => {
    await expect(communityEdition.announcedChanges('any-tenant')).resolves.toEqual([])
    await expect(communityEdition.maintenanceWindow()).resolves.toBeNull()
  })
})

describe('the fixed tenant id', () => {
  const root = join(__dirname, '..', '..')
  const allowed = new Set([
    'server/auth/config.ts', // where it is defined
    'server/edition/community.ts', // the one place that may answer with it
  ])

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : []
    })

  it('is named nowhere in application code outside the edition', () => {
    const offenders = sources(root)
      .map((path) => relative(root, path))
      .filter((path) => !allowed.has(path))
      .filter((path) => readFileSync(join(root, path), 'utf8').includes('defaultTenantId'))

    expect(offenders).toEqual([])
  })
})
