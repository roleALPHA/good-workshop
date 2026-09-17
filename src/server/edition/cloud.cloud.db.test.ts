import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { createShareLink } from '@/domain/workshop/share-links'
import { createAuthorizationCode, issueTokens, registerClient } from '@/domain/oauth/repo'
import { inviteMember } from '@/domain/tenant/members'
import { issueMagicLink } from '@/server/auth/magic-link'
import { readShareGate } from '@/server/auth/share-invite'
import { hashSecret, parseOAuthToken } from '@/server/auth/tokens'
import { edition } from '@/server/edition'
import { CLIENT_REGISTRY_TENANT } from './cloud'

/**
 * The cloud edition, two tenants side by side.
 *
 * What is asserted is the thing a second tenant breaks first: that somebody
 * who belongs to B signs into B, that B's share links and OAuth grants resolve
 * to B, and that nothing about A leaks into those answers. Plus the rule the
 * whole edition rests on -- one membership per person -- held by the database.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const A = randomUUID()
const B = randomUUID()
const identities: string[] = []

type Person = { identityId: string; memberId: string; email: string; actor: Actor }

async function person(tenantId: string, status = 'active'): Promise<Person> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  const email = `cloud-${identityId}@example.test`
  identities.push(identityId)
  await ops.query(`insert into identity (id, email, status) values ($1, $2, 'active')`, [
    identityId,
    email,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status, first_name, last_name)
     values ($1, $2, $3, 'admin', $4, 'Wolke', 'Test')`,
    [memberId, tenantId, identityId, status],
  )
  return {
    identityId,
    memberId,
    email,
    actor: { tenantId, memberId, tenantRole: 'admin', source: 'web' },
  }
}

let inA: Person
let inB: Person

beforeAll(async () => {
  await ops.connect()
  for (const [id, slug] of [
    [A, `cloud-a-${A.slice(0, 8)}`],
    [B, `cloud-b-${B.slice(0, 8)}`],
  ]) {
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Cloudtest')`, [id, slug])
  }
  inA = await person(A)
  inB = await person(B)
})

afterAll(async () => {
  await ops.query('delete from tenant where id = any($1::uuid[])', [[A, B]])
  await ops.query('delete from identity where id = any($1::uuid[])', [identities])
  await ops.end()
})

describe('signing in', () => {
  it('opens the tenant the person belongs to', async () => {
    expect(await edition.tenantForSignIn(inA.identityId)).toBe(A)
    expect(await edition.tenantForSignIn(inB.identityId)).toBe(B)
  })

  it('opens nothing for somebody without a membership, or a disabled one', async () => {
    expect(await edition.tenantForSignIn(randomUUID())).toBeNull()
    const off = await person(B, 'disabled')
    expect(await edition.tenantForSignIn(off.identityId)).toBeNull()
  })

  it('opens an invitation, which is how it becomes active', async () => {
    const invited = await person(B, 'invited')
    expect(await edition.tenantForSignIn(invited.identityId)).toBe(B)
  })

  it('opens nothing in a suspended tenant', async () => {
    const tenant = randomUUID()
    await ops.query(
      `insert into tenant (id, slug, name, status) values ($1, $2, 'Gesperrt', 'suspended')`,
      [tenant, `cloud-s-${tenant.slice(0, 8)}`],
    )
    try {
      const inSuspended = await person(tenant)
      expect(await edition.tenantForSignIn(inSuspended.identityId)).toBeNull()
    } finally {
      await ops.query('delete from tenant where id = $1', [tenant])
    }
  })

  it('issues the login link of the login form into the right tenant', async () => {
    const issued = await issueMagicLink(inB.email)
    expect(issued?.tenantId).toBe(B)
    const rows = await ops.query(
      `select tenant_id from email_token where email = $1 order by created_at desc limit 1`,
      [inB.email],
    )
    expect(rows.rows[0].tenant_id).toBe(B)
  })
})

describe('one membership per person', () => {
  it('is held by the database', async () => {
    await expect(
      ops.query(
        `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
        [randomUUID(), A, inB.identityId],
      ),
    ).rejects.toThrow(/member_one_tenant_per_identity/)
  })

  it('turns an invitation of somebody from another workspace into a neutral refusal', async () => {
    await expect(
      inviteMember(inA.actor, inB.email, 'member', 'de', {
        firstName: 'Nicht',
        lastName: 'Möglich',
      }),
    ).rejects.toThrow('member.cannotInvite')
  })
})

describe('guest share links', () => {
  it('resolve into the tenant of the workshop, and read there', async () => {
    const workshopId = uuidv7()
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Cloudgast', $3, 'a0')`,
      [workshopId, B, inB.memberId],
    )
    const token = `token-${randomUUID()}`
    await withTenant(inB.actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, inB.actor, workshopId, 'workshop.share')
      await createShareLink(tx, access, 'gast@example.test', 'viewer', hashSecret(token))
    })

    expect(await edition.tenantForShareToken(hashSecret(token))).toBe(B)
    expect(await readShareGate(token)).toMatchObject({ tenantId: B, workshopTitle: 'Cloudgast' })
    expect(await edition.tenantForShareToken(hashSecret('nothing'))).toBeNull()
  })
})

describe('OAuth', () => {
  it('registers clients in the registry, and finds grants and tokens in their tenant', async () => {
    expect(await edition.tenantForClientRegistration()).toBe(CLIENT_REGISTRY_TENANT)

    const { code, tokens } = await withTenant(inB.actor, async (tx) => {
      const client = await registerClient(tx, {
        name: 'Cloud client',
        redirectUris: ['https://client.example.test/callback'],
        confidential: false,
      })
      const code = await createAuthorizationCode(tx, {
        clientId: client.id,
        memberId: inB.memberId,
        scopes: ['workshops:read'],
        resource: 'https://app.example.test/api/mcp',
        redirectUri: 'https://client.example.test/callback',
        codeChallenge: 'x'.repeat(43),
      })
      const tokens = await issueTokens(tx, {
        clientId: client.id,
        memberId: inB.memberId,
        scopes: ['workshops:read'],
        resource: 'https://app.example.test/api/mcp',
        withRefresh: true,
      })
      return { code, tokens }
    })

    expect(await edition.tenantForAuthorizationCode(hashSecret(code))).toBe(B)
    expect(await edition.tenantForOAuthToken(parseOAuthToken(tokens.accessToken)!.tokenKey)).toBe(B)
    expect(await edition.tenantForOAuthToken(parseOAuthToken(tokens.refreshToken!)!.tokenKey)).toBe(
      B,
    )
    expect(await edition.tenantForAuthorizationCode(hashSecret('unknown'))).toBeNull()
  })
})

describe('before anybody has said who they are', () => {
  it('shows nobody’s branding and offers no setup', async () => {
    expect(await edition.tenantForAnonymousBrand()).toBeNull()
    expect(await edition.tenantForSetup()).toBeNull()
  })
})
